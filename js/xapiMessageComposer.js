define([ 'coreJS/adapt',
         'extensions/adapt-trackingHub/js/adapt-trackingHub',
], function(Adapt, trackingHub) {

  var XapiMessageComposer = _.extend({

    _NAME: 'xapiMessageComposer',
    xapiCustom: { verbs: {}, activityTypes: {} },
    _ATB: 'http://adaptlearning.org/xapi/activities/',

    initialize: function() {
      this.setCustomVerbs();
    },

    compose: function (eventSourceName, eventName, args, channel) {
      var statementParts;
      var statement;
      var timestamp = new Date(Date.now()).toISOString();

      funcName = trackingHub.getValidFunctionName(eventSourceName, eventName);
      if (this.hasOwnProperty(funcName)) {
        statement = new ADL.XAPIStatement(); 
        statement.timestamp = timestamp;

        // If channel not defined or if _generateIds is true/undefined, then generate ids locally
        if (!channel || (channel._generateIds || _.isUndefined(channel._generateIds))) {
          statement.generateId();
        }

        // Call the specific composing function for this event
        // it will add things to the statement.
        this[funcName](statement,args); 
        return (statement);
      }
      return (null);
    },

    addCustomComposingFunction: function(eventSourceName, eventName, func) {
      func_name = this.getValidFunctionName(eventSourceName, eventName);
      this[func_name] = func;
    },

    // this function is not used. Shoud be removed.
    setCustomVerbs: function() {
      // tcr stands for TinCan Registry: https://registry.tincanapi.com/
      this.xapiCustom.verbs['tcr_viewed'] = new ADL.XAPIStatement.Verb(
        "http://id.tincanapi.com/verb/viewed",
        {"en-US":"viewed"});
      this.xapiCustom.verbs['tcr_launched'] = new ADL.XAPIStatement.Verb(
        "http://adlnet.gov/expapi/verbs/launched",
        { "en-US": "launched" });
    },

    /*******************************************/
    /*****  Specific composing functions   *****/
    /*******************************************/

    //Adapt_adapt_start: function (statement, args) {
    trackingHub_course_launch: function (statement, args) {
      // course started.
      statement.verb = this.xapiCustom.verbs.tcr_launched;
      statement.object = new ADL.XAPIStatement.Activity(trackingHub._config._courseID);
    },

    Adapt_router_menu: function (statement, args) {
      // visited menu
      statement.verb = this.xapiCustom.verbs.tcr_viewed;
      var objKey = trackingHub.getElementKey(args);
      statement.object = new ADL.XAPIStatement.Activity(trackingHub._config._courseID + "#" + objKey);
      // TODO: at some point, parts of the statement should be configurable
      statement.object.definition = {type: this._ATB + 'menu', name: { 'en-US': 'menu' }};

    },

    Adapt_router_page: function (statement, args) {
      // visited page
      statement.verb = this.xapiCustom.verbs.tcr_viewed;
      var objKey = trackingHub.getElementKey(args);
      statement.object = new ADL.XAPIStatement.Activity(trackingHub._config._courseID + "#" + objKey);
      var t = args.get('_type');
      statement.object.definition = {type: this._ATB + t, name: { 'en-US': t }};
    },

    components_change__isComplete: function (statement, args) {
      // completed interaction
      statement.verb = ADL.verbs.completed;
      var objKey = trackingHub.getElementKey(args);
      statement.object = new ADL.XAPIStatement.Activity(trackingHub._config._courseID + "#" + objKey);
      var t = args.get('_component');
      statement.object.definition = {type: this._ATB + t, name: { 'en-US': t }};
      if (args.get('_isQuestionType')) {
        var resultObj = {
          score: { raw: args.get('_score') },
          success: args.get('_isCorrect'),
          completion: true,
          response: JSON.stringify(args.get('_userAnswer')),
        }
        statement.result = resultObj;
      }
    },

    Adapt_assessments_complete: function (statement, args) { 
      // completed assessment 
      statement.verb = ADL.verbs.completed;
      statement.object = new ADL.XAPIStatement.Activity(trackingHub._config._courseID + "#" + args.id);
      var t = args.type;
      statement.object.definition = {type: this._ATB + t, name: { 'en-US': t }};
      var result = { score: { raw: args.score },
        success: args.isPass,
        completion: args.isComplete,
        response:  ''
      }
      statement.result = result;
     },

    contentObjects_change__isComplete: function (statement, args) {
      // completed contentObject
      statement.verb = ADL.verbs.completed;
      var objKey = trackingHub.getElementKey(args);
      statement.object = new ADL.XAPIStatement.Activity(trackingHub._config._courseID + "#" + objKey);
      var t = args.get('_type');
      statement.object.definition = {type: this._ATB + t, name: { 'en-US': t }};
    },

    course_change__isComplete: function (statement, args) {
      // completed course
      statement.verb = ADL.verbs.completed;
      var objKey = trackingHub.getElementKey(args);
      statement.object = new ADL.XAPIStatement.Activity(trackingHub._config._courseID + "#" + objKey);
      var t = args.get('_component');
      statement.object.definition = {type: this._ATB + t, name: { 'en-US': t }};
    }

  }, Backbone.Events);

  XapiMessageComposer.initialize();
  return (XapiMessageComposer);
});

