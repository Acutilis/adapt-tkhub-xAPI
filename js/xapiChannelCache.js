define([], function() {
  /**
   * Maintain an optional local cache of state and statements.
   *
   * Using localStorage store state and statements that are waiting to
   * sent to the LRS. State is consistently maintained as a failover
   * for when an internet connection is not present. Statements are
   * held in an array until they are sent, at which point they are
   * remove from the array and the cache is updated.
   */
  var Cache = function(channel, wrapper, chRef) {
    this.channel = channel;
    this.wrapper = wrapper;
    this.chRef = chRef;  //reference to the xapiChannelHandler.

    this.storage = window.localStorage || null;
    if (!this.storage) {
      return;
    }

    // Check if we are changing actors, is so we need to clear cached data
    // to compare, we must use the same types of objects (Agent)
    var wrapperAgent = this.getWrapperActor();
    var cachedAgent = this.getCachedActor();

    // for adlxapi launch method, wipe the cache.
    if (! wrapperAgent || ! cachedAgent || !_.isEqual(wrapperAgent, cachedAgent)
          || this.channel._xapiLaunchMethod == 'adlxapi') {
      this.clearCachedState();
      this.clearCachedStatements();
      this.setCachedActor(wrapperAgent);
    }

  };

  Cache.prototype = {
    channel: null,
    wrapper: null,
    storage: null,
    retryTimer: null,
    pending: 0,
    isCacheEnabled: function() {
      // if  launch method is adlxapi, do not use cache at all
      if (!this.storage || !this.channel || this.channel._xapiLaunchMethod == 'adlxapi') {
        return false;
      }

      return this.channel._isCachedLocally || false;
    },
    isMobile: function() {
      return this.channel._isMobile || false;
    },
    isAlreadySending: function() {
      return this.pending > 0;
    },
    getCachedActor: function() {
      var xa = this.storage.getItem('xapi_actor');
      try {
        var actor = JSON.parse(xa);
      } catch(e) {
        actor = null;
      }
      return new ADL.XAPIStatement.Agent(actor);
    },
    setCachedActor: function(actor) {
      var actorStr =  (typeof(actor) == "string") ? actor : JSON.stringify(actor);
      return this.storage.setItem('xapi_actor', actorStr);
    },

    getWrapperActor: function() {
      /*
      var actor = this.wrapper.lrs.actor;
       ?? actor is already an object. Json.parse will always fail
         also, can't restrict actor to 'mbox' type ones... there are other identifiers
         for actors.
      try {
        var parsed = JSON.parse(actor);
        actor = parsed.mbox || null;
      } catch(e) {
        actor = null;
      }
      return actor;
      */
      return this.chRef._ACTOR;
    },

    setState: function(courseID, actor, stateId, registration, state, callback) {
      // Update states generation date
      state.generated = (new Date()).toISOString();
      state.actor = actor;

      this.setCachedState(state);

      // Push data to remote LRS
      this.wrapper.sendState(courseID, actor, stateId, registration, state, null, null, _.bind(function(err, res, result) {
        if (err) {
          // Mobile ignores network errors
          if (this.isMobile()) {
            return callback(null, false);
          }

          return callback(err);
        }

        if (res.readyState === 4 && (res.status === 200 || res.status === 204)) {
          return callback(null, true);
        }

        return callback(null, false);
      }, this));
    },
    getState: function(courseID, actor, stateId, registration, callback) {
      this.wrapper.getState(courseID, actor, stateId, registration, null, _.bind(function(err, res, result) {
        if (err && !this.isMobile()) {
          return callback(err);
        }

        var cache = this.getCachedState();

        // If error, no data from server; use cache (or empty object returned by cache)
        if (err || !result || _.isArray(result) || result.error) {
          return callback(null, cache);
        }

        // If result is old (no generation date) use cache if generation date present
        if (!result.generated && cache.generated) {
          return callback(null, cache);
        }

        // If cached value is newer then server value use the cached value
        if (Date.parse(result.generated) < Date.parse(cache.generated)) {
          return callback(null, cache);
        }

        // Use server state
        return callback(null, result);
      }, this));
    },
    sendStatement: function(statement, callback) {
      if (this.channel._isFakeLRS) {
        return callback();
      }

      if (!this.isCacheEnabled()) {
        this.wrapper.sendStatement(statement,  _.bind(function(err, res, result) {
          if (err) {
            var error = new Error('Error sending statements - ' + err.message);
            this.trigger('sendingComplete', error);
            return callback(error);
          }
          this.trigger('sendingComplete');
          return callback();
        }, this));
      } else {
        this.addStatementToCache(statement);
        this.sendStatements(callback);
      }
    },

    sendStatements: function(callback) {
      if (this.channel._isFakeLRS) {
        this.trigger('sendingComplete');
        return callback(null, 0);
      }

      // Avoid sending duplicates due to race condition
      // If a request is already in flight do not start another one
      if (this.pending >= 1) {
        // Don't emit sending complete as we are still in the middle of sending
        return callback();
      }

      var statements = this.getCachedStatements();

      // TODO max statements to send in one request should be configurable
      var payload = statements.slice(0, 25);

      if (_.isEmpty(payload)) {
        return callback();
      }
      //
      // Track how many inflight requests. We only allow one inflight request at a time
      // to deal with race conditions in the statement queue handling
      this.pending++;

      var sendStatementsCallback = _.bind(function(err, res, result) {
        // We are done with the queue, we can let another request happen
        this.pending--;

        if (err) {
          // Check if request failed. We may not beable to check errors until an issue with the xapi wrapper
          this.setupRetry();

          var error = new Error('Error sending statements - ' + err.message);
          this.trigger('sendingComplete', error);
          return callback(error);
        }

        // We had a successful requst, clear any pending request
        this.clearRetry();

        // Re-get the cache as statements may have been added
        var cached = this.getCachedStatements();
        // Get statements that were not sent in this batch
        var remaining = cached.slice(payload.length);

        // If any statements were not send, prepare to resend
        this.setCachedStatements(remaining);

        // If there are still statements to send, do it
        if (remaining.length > 0) {
          return this.sendStatements(callback);
        }

        this.trigger('sendingComplete');
        return callback();
      }, this);

      if (payload.length == 1) {
          this.wrapper.sendStatement(payload[0], sendStatementsCallback );
      } else {
          this.wrapper.sendStatements(payload, sendStatementsCallback );
      }
    },

    setupRetry: function() {
      // Retry already in progress, clear it and delay more
      this.clearRetry();

      // Wait a while and try again
      this.retryTimer = setTimeout(_.bind(function() {
        // Clear any existing retrys
        this.clearRetry();
        this.sendStatements(_.bind(function(err) {
          if (err) {
            this.setupRetry();
          }
        }, this));
      }, this), 30000); // 30 seconds TODO: make this configurable?
    },
    clearRetry: function() {
      if (this.retryTimer) {
        clearTimeout(this.retryTimer);
        this.retryTimer = null;
      }
    },

    getStateKey: function() {
      var reg = this.chRef._REGISTRATION;
      return  reg ? 'xapi_state_' + reg : 'xapi_state'; 
    },

    getCachedState: function() {
      if (!this.isCacheEnabled()) {
        return {};
      }

      var state = this.storage.getItem(this.getStateKey());
      // If null/falsey then no data, return empty state object
      if (!state) {
        return {};
      }

      try {
        state = JSON.parse(state);
      } catch(e) {
        // TODO add logging
        return {};
      }

      return state;
    },
    setCachedState: function(state) {
      if (!this.isCacheEnabled()) {
        return;
      }

      this.storage.setItem(this.getStateKey(), JSON.stringify(state));
    },
    clearCachedState: function() {
      this.storage.removeItem(this.getStateKey());
    },
    addStatementToCache: function(statement) {
      var statements = this.getCachedStatements();
      statements.push(statement);
      this.setCachedStatements(statements);
    },
    hasStatementsToSend: function() {
      return this.getCachedStatements().length > 0;
    },
    getCachedStatements: function() {
      if (!this.isCacheEnabled()) {
        return [];
      }

      // Get encoded statements
      var statements = this.storage.getItem('xapi_statements');

      // If null/falsey then no encoded, return empty array
      if (!statements) {
        return [];
      }

      // Parse stored data
      try {
        statements = JSON.parse(statements);
      } catch(e) {
        return [];
      }

      // If retieved statements are not valid return empty array
      if (!this.isValidStatementsArray(statements)) {
        return [];
      }

      return statements;
    },
    setCachedStatements: function(statements) {
      if (!this.isCacheEnabled()) {
        return;
      }

      // Check that statements are valid before updating storage
      if (!this.isValidStatementsArray(statements)) {
        throw new Exception('Invalid statements array');
      };

      this.storage.setItem('xapi_statements', JSON.stringify(statements));
    },
    clearCachedStatements: function() {
      this.storage.removeItem('xapi_statements');
    },
    isValidStatementsArray: function(statements) {
      return (statements && statements instanceof Array);
    }
  };

  _.extend(Cache.prototype, Backbone.Events);
  
  return Cache;
})
