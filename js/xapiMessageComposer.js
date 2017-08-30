define([ 'coreJS/adapt',
         'extensions/adapt-trackingHub/js/adapt-trackingHub',
], function(Adapt, trackingHub) {

  var XapiMessageComposer = _.extend({

    _NAME: 'xapiMessageComposer',
    xapiCustom: { verbs: {}, activityTypes: {} },
    _ATB: 'http://adaptlearning.org/xapi/activities/',
    _CMI5DEFINED_CTXT_TEMPLATE: null,
    _CMI5ALLOWED_CTXT_TEMPLATE: null,

    initialize: function() {
      this.setCustomVerbs();
    },

    compose: function (eventSourceName, eventName, args, channel, template) {
      // template is null or a string: CMI5Defined or CMI5Allowed
      var statementParts;
      var statement;
      var timestamp = new Date(Date.now()).toISOString();

      funcName = trackingHub.getValidFunctionName(eventSourceName, eventName);
      if (this.hasOwnProperty(funcName)) {
        statement = new ADL.XAPIStatement();
        if (this._CMI5DEFINED_CTXT_TEMPLATE!=null && this._CMI5ALLOWED_CTXT_TEMPLATE!=null) {
            var ctx = {};
            var template = template || 'CMI5Allowed';
            if (template == 'CMI5Defined') {
                ctx = this._CMI5DEFINED_CTXT_TEMPLATE;
            } else if (template == 'CMI5Allowed') {
                ctx = this._CMI5ALLOWED_CTXT_TEMPLATE;
            }  else {
            console.log('xapiMessageComposer: requested composing with template but no valid template specified (only CMI5Defined and CMI5Allowed are valid). Using empty context.');
            }
            statement.context = ctx;
        }
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

    setContextTemplate(ctx) {
        // sets both the cmi5defined and the cmi5allowed templates
        // they only differ in the category being cmi5 or not.
        this._CMI5DEFINED_CTXT_TEMPLATE = ctx;
        var allowedctx = $.extend(true,{},ctx);
        // look in context.contextActivities.category, and if any has the
        // id of https://w3id.org/xapi/cmi5/context/categories/cmi5  remove it
        var index = _.findIndex(allowedctx.contextActivities.category, function(item) {
            return (item['id'] == 'https://w3id.org/xapi/cmi5/context/categories/cmi5');
        });
        if (index > -1) {
          allowedctx.contextActivities.category.splice(index, 1);
        }
        this._CMI5ALLOWED_CTXT_TEMPLATE = allowedctx;
    },

    getCMI5DefinedContextTemplate: function() {
        return this._CMI5DEFINED_CTXT_TEMPLATE;
    },

    getCMI5AllowedContextTemplate: function() {
        return this._CMI5ALLOWED_CTXT_TEMPLATE;
    },

    getXAPIResponse: function(view) {
      var type = view.getResponseType();
      var response = view.getResponse();

      //, choice, fill-in, long-fill-in, matching, performance, sequencing, likert, numeric or other
      switch(type) {
      case 'true-false':
        if (!response || response === "false" || response === "0") {
          return 'false';
        }

        return 'true';
      case 'performance':
      case 'sequencing':
      case 'choice':
        var selected = response.split(',');
        return selected.join('[,]');
      case 'fill-in':
      case 'long-fill-in':
        return response;
      case 'matching':
        var pairs = response.split('#');
        response = pairs.join('[,]');
        var parts = response.split('.');
        return parts.join('[.]');
      case 'ikert':
      case 'numeric':
        // TODO this really should handle ranges, which is not
        // supported by SCORM (AFAIK)
      case 'other':
        return response;
      default:
        throw new Error('Inexpected response type: ' + type);
      }

      return response;
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

    Adapt_questionView_recordInteraction: function(statement, args) {
      // answered question
      statement.verb = ADL.verbs.answered;
      var objKey = trackingHub.getElementKey(args.model);
      statement.object = new ADL.XAPIStatement.Activity(trackingHub._config._courseID + "#" + objKey);
      var t = args.model.get('_component');
      statement.object.definition = {type: this._ATB + t, name: { 'en-US': t }};

      var response = '';
      if (typeof args.getResponse === 'function' && typeof args.getResponseType === 'function') {
        response = this.getXAPIResponse(args);
      } else if (args.model.has('_userAnswer')) {
        response = args.model.get('_userAnswer');
      }

      var resultObj = {
        score: { raw: args.model.get('_score') },
        success: args.model.get('_isCorrect'),
        completion: true,
        response: response
      }
      statement.result = resultObj;
    },

    components_change__isComplete: function (statement, args) {
      // Don't track _isComplete === false
      if (!args.get('_isComplete')) {
        return false;
      }

      // completed interaction
      statement.verb = ADL.verbs.completed;
      var objKey = trackingHub.getElementKey(args);
      statement.object = new ADL.XAPIStatement.Activity(trackingHub._config._courseID + "#" + objKey);
      var t = args.get('_component');
      statement.object.definition = {type: this._ATB + t, name: { 'en-US': t }};
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
      var t = args.get('_type');
      statement.object.definition = {type: this._ATB + t, name: { 'en-US': objKey }};
    }

  }, Backbone.Events);

  XapiMessageComposer.initialize();
  return (XapiMessageComposer);
});
