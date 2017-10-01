define([
         'coreJS/adapt',
         'extensions/adapt-trackingHub/js/adapt-trackingHub',
         './xapiwrapper.min',
         './xapiMessageComposer',
         './xapiChannelCache',
         '../libraries/async.min.js',
         '../libraries/iri.js',
], function(Adapt, trackingHub, xapiwrapper, msgComposer, ChannelCache, async, iri) {

  var XapiChannelHandler = _.extend({

    _CHID: 'xapiChannelHandler',
    _STATE_ID: 'ACTIVITY_STATE',
    _OWNSTATEKEY: 'xapi',
    _OWNSTATE: null,
    _COMPOSER: msgComposer,

    // data that might be set by the launch sequence. 
    _ACTOR: null,
    _REGISTRATION: null,
    _CTXT_ACTIVITIES: null, // necessary for adl-xapi-launch
    // END data that might be set by the launch sequence. 

    _wrappers: {},

    initialize: function() {
      console.log('Initializing xapiChannelHandler');
      this.listenToOnce(Adapt.trackingHub, 'stateReady', this.onStateReady);
      trackingHub.addChannelHandler(this);
    },

    /*******************************************
    /*******      CONFIG  FUNCTIONS      *******
    /*******************************************/

    checkConfig: function() {
      this._config = Adapt.config.has('_tkhub-xAPI')
        ? Adapt.config.get('_tkhub-xAPI')
        : false;
      if (!this._config )
        return false;

      this._config._channels = this._config._channels || [];
      if (! _.isArray(this._config._channels)) {
        console.log('The _channels setting must be an array.');
        return false;
      }
      var allChCorrect = true;
      _.each(this._config._channels, function(channel) {
          allChCorrect = allChCorrect && trackingHub.checkCommonChannelConfig(channel);
          allChCorrect = allChCorrect && this.checkSpecificConfig(channel);
      }, this);
      return allChCorrect;
    },

    checkSpecificConfig: function(channel) {
      // For any undefined values, set a default. Check that all the settings have the correct types.
      if (channel._endPoint == undefined)
        channel._endPoint = '';
      if (channel._xapiLaunchMethod == undefined)
        channel._xapiLaunchMethod =  'hardcoded';
      if (channel._isFakeLRS == undefined)
        channel._isFakeLRS = false;
      if (channel._homePage == undefined)
        channel._homePage = 'http://www.mylms.com';
      if (channel._mbox == undefined)
        channel._mbox = 'mailto:johndoe@example.com';
      if (channel._fullName == undefined)
        channel._fullName = 'John Doe';
      if (channel._userName == undefined)
        channel._userName = '';
      if (channel._password == undefined)
        channel._password = '';

      if ( _.isString(channel._xapiLaunchMethod) &&
         ( _.isBoolean(channel._isFakeLRS)) &&
         ( _.isString(channel._homePage)) &&
         ( _.isString(channel._mbox)) &&
         ( _.isString(channel._fullName)) &&
         ( _.isString(channel._userName)) &&
         ( _.isString(channel._password))) {
         return true;
      }
      console.log('There are errors in the specific channel settings for channel ' + channel._name + '.');
      return false;
    },

    getChannelDefinitions: function() {
      return this._config._channels;
    },

    applyChannelConfig: function(channel) {
        // To create the xAPIWrapper we need a configuration object.
        // This conf object provides some critical info, such as the endpoint, etc.
        // This info might come from the launch sequence, the configuration file,
        // or from both. Priority should be given to info coming from the launch sequence.
        // ALSO, some launch methods will create a 'statement template' that should be passed to 'messageComposer' 
        // cmi5 is specially nitpicky about this...

        console.log('xapiChannelHandler applying config to channel ' + channel._name);
        // THIS condition should be based on the channel._xapiLaunchMethod
        // HERE HERE change conditions, for acusplitap, adlxapi, and others.
        if (channel._xapiLaunchMethod == 'acusplitap') {
            // ["endpoint","auth","actor","registration","activity_id"
          var conf = { actor: this._ACTOR, registration: channel._LaunchData.registration };
          conf.strictCallbacks = true;
          var l = document.createElement("a");
          l.href = '/xAPI/';
          // now l.href contains the complete url (http://whatever.com/xAPI/)
          _.extend(conf, {"endpoint": l.href} );
          _.extend(conf, {"auth": "Basic " + toBase64('nouser:nopassword') });
          this._wrappers[channel._name] = new ChannelCache(channel, new XAPIWrapper(conf, false), this);
          // now the statement templates
          // msgComposer._CONTEXT_TEMPLATE = channel._LaunchData;
          msgComposer.setContextTemplate(channel._LaunchData.contextTemplate);

        } else if (channel._xapiLaunchMethod == 'adlxapi')  {
          // if (channel._PREBUILTWRAPPER) {  // will be true if adlxapi launch
          this._wrappers[channel._name] = new ChannelCache(channel, channel._PREBUILTWRAPPER, this);
        } else {
          var conf = { actor: this._ACTOR, registration: this._REGISTRATION };
          conf.strictCallbacks = true;
          _.extend(conf, {"endpoint": channel._endPoint} );
          _.extend(conf, {"auth": "Basic " + toBase64(channel._userName + ":" + channel._password) });
          this._wrappers[channel._name] = new ChannelCache(channel, new XAPIWrapper(conf, false), this);
        }
    },


    /*******  END CONFIG FUNCTIONS *******/



    /*******************************************
    /*******  LAUNCH SEQUENCE  FUNCTIONS *******
    /*******************************************/

    startLaunchSequence: function(channel, courseID) {
      // Use introspection. Just call the appropriate function if it exists.
      var launchFName = 'launch_' + channel._xapiLaunchMethod.toLowerCase();
      if (this.hasOwnProperty(launchFName)) {
          this[launchFName](channel, courseID);
      } else {
          alert('Unknown launch method (' + channel._xapiLaunchMethod + ') specified in config for channel ' + channel._name +
                '. Please fix it. xAPI content cannot be loaded and tracked without a proper launch. Aborting.');
          window.location.href = '/';
      }
      // this.trigger('launchSequenceFinished');
    },

    launch_acusplitap: function(channel, courseID) {
        console.log('xapiChannelHandler ' + channel._name + ': starting acusplitap launch sequence...');
        // actor is nobody@noplace.no
        this._ACTOR = new ADL.XAPIStatement.Agent('mailto:nobody@noplace.no', 'Nobody No');
        // LRS endpoint is always /xAPI
        // that = this;
        $.ajax({
            context: this,
            url: '/LD',
            method:  'POST',
            // crossDomain: true,
            // xhrFields: { withCredentials: true },
            success: function(data, status, xhr) {
                var LD = JSON.parse(data);
                this.initLaunchData(channel, LD);
                console.log('xapiChannelHandler ' + channel._name + ': acusplitap launch sequence finished.');
                this.trigger('launchSequenceFinished');
            },
            error: function(data, status, x) {
                console.log('Error getting Launch Data. Tracking on this channel will not work.', x);
                alert('Error getting Launch Data. In an acu-splitAP launch, the server side must provide launch data. Aborting.');
                window.location.href = '/';
            }
        });
    },

    initLaunchData: function(channel, LD) {
       // sets the channel launch data, starting with the LD that was obtained during launch.
       // provide default values for critical launch data items.
       channel._LaunchData = null;
       if (! LD.activityId) { LD.activityId = trackingHub._config._courseID; }
       if(! LD.returnURL) { LD.returnURL = '/econtent/units' }
       var l = document.createElement("a");
       l.href = LD.returnURL;
       LD.returnURL = l.href;
       var returnIRI = new IRIAPI.IRI(LD.returnURL);
       if (! returnIRI.isAbsolute()) {
           alert('Error in Launch Data: returnURL MUST be an absolute IRI. Aborting.');
           window.location.href = '/';
           return;
       }
       LD.returnURL = returnIRI;
       if(! LD.bailoutURL) {
           LD.bailoutURL = LD.returnURL;
       } else {
           l.href = LD.bailoutURL;
           LD.bailoutURL = l.href;
           var bailoutIRI = new IRIAPI.IRI(LD.bailoutURL);
           if (! bailoutIRI.isAbsolute()) {
               alert('Error in Launch Data: bailoutURL MUST be an absolute IRI. Aborting.');
               window.location.href = '/';
               return;
           }
       }
       if (! LD.sessionId) {
           alert('Error in Launch Data: In an acu-splitAP launch, launch data MUST include the sessionId. Aborting.');
           window.location.href = bailoutIRI;
           // return;
       }
       if (! LD.registration) {
           alert('Error in Launch Data: In an acu-splitAP launch, launch data MUST include the registration. Aborting.');
           window.location.href = bailoutIRI;
           return;
       }
       if (! LD.contextTemplate || LD.contextTemplate == {} ) {
           alert('Error in Launch Data: In an acu-splitAP launch, launch data MUST include a non-empty contextTemplate. Aborting.');
           window.location.href = bailoutIRI;
           return;
       }
       if(! LD.launchMode) { LD.launchMode = 'Normal'; }

       // now verify that activityId is IRI, that returnURL and bailoutURL are IRIS
       var activityIRI = new IRIAPI.IRI(LD.activityId);
       if (! activityIRI.isAbsolute()) {
           alert('Error in Launch Data: activityId MUST be an absolute IRI. Aborting.');
           window.location.href = bailoutIRI;
           return;
       }
       // also, , verify that the following parts of the launch data contain valid data
       // - contextTemplate: If NON empty object verify that it ONLY has allowed keys
       var ctKeys = _.keys(LD.contextTemplate);
       var xtraKeys = _.difference(ctKeys, ['registration', 'instructor', 'team', 'contextActivities', 'revision', 'platform', 'language', 'statement', 'extensions']);
       if (!_.isEmpty(xtraKeys)) {
           console.log('Extra keys found.', xtraKeys);
           alert('Error in Launch Data: contextTemplate contains keys that are not allowed in a context for a statement. Aborting.');
           window.location.href = bailoutIRI;
           return;
       }
       if(LD.contextTemplate.contextActivities) {
           var ctxtActKeys = _.keys(LD.contextTemplate.contextActivities);
           var xtraActKeys = _.difference(ctxtActKeys, ['parent', 'grouping', 'category', 'other']);
           if (!_.isEmpty(xtraActKeys)) {
               console.log('Extra keys found.', xtraActKeys);
               alert('Error in Launch Data: contextTemplate.contextActivities contains keys that are not allowed for contextActivities. Aborting.');
               window.location.href = bailoutIRI;
               return;
           }
       }
       // I'm not going to do deeper checking on the context template for now.
       // - launchMode one of: Normal, Browse, or Review
       if (LD.launchMode != 'Normal' && LD.launchMode != 'Browse' && LD.launchMode != 'Review') {
           alert('Error in Launch Data: launchMode MUST be one of: Normal, Browse, Review. Aborting.');
           window.location.href = bailoutIRI;
           return;
       }
       // - masteryScore: decimal value between 0 and 1 (up to 4 decimals)
       if (LD.masteryScore) {
           var newMS = parseFloat(parseFloat(LD.masteryScore).toFixed(4))
           if (newMS < 0 || newMS > 1) {
               alert('Error in Launch Data: if provided, masteryScore MUST be a decimal number between 0 and 1. Aborting.');
                window.location.href = bailoutIRI;
               return;
           }
           LD.masteryScore = newMS;
       }
       // - moveOn, one of Passed, Completed, CompletedAndPassed, CompletedOrPassed, NotApplicable
       if (LD.moveOn != 'Passed' && LD.moveOn != 'Completed' && LD.moveOn != 'CompletedAndPassed' && LD.moveOn != 'CompletedOrPassed' && LD.moveOn != 'NotApplicable') {
           alert('Error in Launch Data: moveOn MUST be one of: Passed, Completed, CompletedAndPassed, CompletedOrPassed, NotApplicable. Aborting.');
           window.location.href = bailoutIRI;
           return;
       }
       // - extraParameters: any object. Nothing to verify.
       // set the channel._LaunchData
       channel._LaunchData = LD;
    },

    launch_spoor: function(channel, courseID) {
        // the LRS data is read from the config file (it is basically harcoded into the content)
        // and the user id is retrieved through the LMS (the SCORM API)
        var studentID = pipwerks.SCORM.data.get("cmi.core.student_id"); // hard assumption on SCORM 1.2
        // I'd rather use Spoor's ScormWrapper.getStudentId() ... but I don't know how/if Spoor exposes part of its internal functionality
        var accountObj = { homePage: channel._homePage,
                           name: studentID
        }
        Adapt.trackingHub.userInfo.account =  accountObj;
        // in the spoor launch, the channel._endPoint is set through the configuration file, so no need to set it here
        this._ACTOR = new ADL.XAPIStatement.Agent(accountObj);
        this.trigger('launchSequenceFinished');
    },

    launch_rustici: function(channel, courseID) {
        console.log('xapiChannelHandler ' + channel._name + ': starting rustici launch sequence...');
        // The format of the launch query string is:
        //<AP URL>/?endpoint=<lrsendpoint>&auth=<token>&actor=<learner>[&registration=<registration>][&activity_id=<activity ID>
        //[&activity_platform=<platform>][&Accept-Language=<acceptlanguage>][&grouping=<grouping activity ID>]
        var qs = trackingHub.queryString();
        var actor = JSON.parse(qs.actor);
        Adapt.trackingHub.userInfo.mbox =  actor.mbox;
        Adapt.trackingHub.userInfo.fullName =  actor.name;
        // in the rustici launch, the channel._endPoint is taken from  the query param
        channel._endPoint = qs['endpoint'] 
        this._ACTOR = new ADL.XAPIStatement.Agent(actor.mbox, actor.name);
        this._LANG = qs['Accept-Language'];
        if (qs.activity_id) {
          // override the activity id if one was passed in the query string.
          trackingHub._config._courseID = qs.activity_id;
        }
        this._REGISTRATION = qs.registration;
        console.log('xapiChannelHandler ' + channel._name + ': rustici launch sequence finished.');
        this.trigger('launchSequenceFinished');
    },

    launch_adlxapi: function(channel, courseID) {
        console.log('xapiChannelHandler ' + channel._name + ': starting launch sequence...');
        // adl xapi launch functionality is provided by the xAPIwrapper, so we just do as
        // explained in https://github.com/adlnet/xAPIWrapper#xapi-launch-support
        var xch = this; // save reference to 'this', because I need it in the ADL.launch callback
        ADL.launch(function(err, launchdata, xAPIWrapper) {
          if (!err) {
            // console.log("--- content launched via xAPI Launch ---\n", wrapper.lrs, "\n", launchdata);
            // the 'launch' function provided by xAPIWrapper already returns a pre-made xAPIWrapper, and
            // we MUST use that (it takes care of the cookie etc.)
            channel._PREBUILTWRAPPER = xAPIWrapper;
            // But other parts of the code rely on individual pieces of data (such as _ACTOR) even though
            // they exist in the pre-built wrapper, so we set those here
            channel._endPoint = launchdata.endpoint 
            xch._ACTOR = new ADL.XAPIStatement.Agent(launchdata.actor);
            // xch._ACTOR = launchdata.actor;
            xch._CTXT_ACTIVITIES = launchdata.contextActivities;
            console.log('xapiChannelHandler ' + channel._name + ': adlxapi (xapi-launch) launch sequence finished.');
            xch.trigger('launchSequenceFinished');
          } else {
            alert('ERROR: could not get xAPI data from xAPI-launch server!. Tracking on this channel will NOT work!');
            //xch.trigger('launchSequenceFinished');
          }
        }, true, true);
    },

    launch_hardcoded: function(channel, courseID) {
        console.log('xapiChannelHandler ' + channel._name + ': starting hardcoded launch sequence...');
        Adapt.trackingHub.userInfo.mbox =  channel._mbox;
        Adapt.trackingHub.userInfo.fullName =  channel._fullName;
        // in the harcoded launch, the channel._endPoint is taken from the config file, so no need to set it here.
        this._ACTOR = new ADL.XAPIStatement.Agent(Adapt.trackingHub.userInfo.mbox, Adapt.trackingHub.userInfo.fullName);
        console.log('xapiChannelHandler ' + channel._name + ': hardcoded launch sequence finished.');
        this.trigger('launchSequenceFinished');
    },

    /*******  END LAUNCH SEQUENCE FUNCTIONS *******/


    processEvent: function(channel, eventSourceName, eventName, args) {
      // In this xapi channel handler we are just going to compose & deliver the message corresponding to this event
      // msgComposer is a reference to the message composer that this particular channel handler uses.
      var isEventIgnored = _.contains(channel._ignoreEvents,eventName);
      if ( !isEventIgnored && channel._reportsEvents ) {
        var message = msgComposer.compose(eventSourceName, eventName, args, channel)
        if (message) {
          // in this case, the message is an INCOMPLETE xAPI statement, it's missing the Actor.
          // We add it here
          if (! message.actor) {
              message.actor = this._ACTOR;
          }
          message.context = message.context || {};
/*          if (! message.context) {
              msg.context = {}
          } */
          if (! message.context.contextActivities && this._CTXT_ACTIVITIES) {
              message.context.contextActivities = this._CTXT_ACTIVITIES;
          }
          this.deliverMsg(message, channel);
        }
      }

      // call specific event handling function for the event being processed, if it exists
      // funcName = Adapt.trackingHub.getValidFunctionName(eventSourceName, eventName);
      // console.log('funcName = ' + funcName);
      // We only need to write event handling functions for the events that we care about
      // In this particular channel handler we don't need to do any specific processing for particular events.
      // if (this.hasOwnProperty(funcName)) {
      //   this[funcName](args);
      // }
      // the fact that there's no method to handle a specific event is NOT an error, it's simply that this ChanneHandler doesn't care  about that event.

      // If there's any common processing that we need to do, no matter what event happened, do it here.
    },

    deliverMsg: function(message, channel) {
      if (channel._xapiLaunchMethod == 'acusplitap') {
          if (document.cookie.indexOf(channel._LaunchData.trkCookieName) == -1) {
              // tracking cookie is gone. Bail out.
              alert('Tracking Cookie required. Aborting.');
              window.location.href = channel._LaunchData.bailoutURL;
          }
      }
      this._wrappers[channel._name].sendStatement(message, _.bind(function(err) {
        if (err) {
          //alert('Error saving data. Aborting.');
          // window.location.href = channel._LaunchData.bailoutURL;
          throw err;
        }

        console.log('Statement sent/queued');
      }, this));
    },

    /*******************************************
    /*******  STATE MANAGEMENT FUNCTIONS *******
    /*******************************************/

    // this xAPIChannelHandler only implements load/save state.
    // It does NOT keep its own particular representation of state.

    saveState: function(state, channel, courseID) {
      // If we want a channelHandler to be  capable of saving state, we have to implement this function.
      // IMPORTANT: this function is always called from trackingHub NOT from within this channel handler!
      // Call the xapiwrapper to save state.

      console.log('xapiChannelHandler: state saving');
      if (channel._xapiLaunchMethod == 'acusplitap') {
          if (document.cookie.indexOf(channel._LaunchData.trkCookieName) == -1) {
              // tracking cookie is gone. Bail out.
              alert('Tracking Cookie required. Aborting.');
              window.location.href = channel._LaunchData.bailoutURL;
          }
      }
      this._wrappers[channel._name].setState(courseID, this._ACTOR, this._STATE_ID, this._REGISTRATION, state, _.bind(function(err) {
        if (err) {
          // alert('Error saving data. Aborting.');
          // window.location.href = channel._LaunchData.bailoutURL;
          throw err;
        }

        console.log('xapiChannelHandler: state saved');
      }, this));
    },

    loadState: function(channel, courseID) {
      console.log('xapiChannelHandler: state retrieving');
      this._wrappers[channel._name].getState(courseID, this._ACTOR, this._STATE_ID, this._REGISTRATION, _.bind(function(err, state) {
        if (err) {
          alert('Error loading data. Aborting.');
          window.location.href = channel._LaunchData.bailoutURL;
          throw err;
        }

        console.log('xapiChannelHandler: state retrieved');
        this.trigger('stateLoaded', state);
      }, this));
    },

    hasPendingStatements: function() {
      var hasStatements = false;
      _.each(this._wrappers, function(wrapper) {
        if (wrapper.hasStatementsToSend()) {
          hasStatements = true;
        }
      });

      return hasStatements;
    },
      
    sendPendingStatements: function(callback) {
      async.forEachSeries(this._wrappers, function(wrapper, callback) {
        // It's possible that we are alrady sending the data
        if (wrapper.isAlreadySending()) {
          wrapper.once('sendingComplete', function(event) {
            console.log('sendingComplete', event);
            return callback();
          });
          return;
        }
        
        wrapper.sendStatements(callback);
      }, function(err, result) {
        if (err) {
          return callback(err);
        }

        return callback();
      });
    }

    /*******  END STATE MANAGEMENT FUNCTIONS ********/

    /*******************************************
    /*** SPECIFIC EVENT PROCESSING FUNCTIONS ***
    /*******************************************/

    // no need to do any specific event processing in this channel handler.

    /*******  END SPECIFIC EVENT PROCESSING FUNCTIONS ********/
  }, Backbone.Events);

  XapiChannelHandler.initialize();
  return (XapiChannelHandler);
});
