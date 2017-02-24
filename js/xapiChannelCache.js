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
  var Cache = function(channel, wrapper) {
    this.channel = channel;
    this.wrapper = wrapper;
    this.storage = window.localStorage || null;
    if (!this.storage) {
      return;
    }
  };

  Cache.prototype = {
    channel: null,
    wrapper: null,
    storage: null,
    retryTimer: null,
    pending: 0,
    isCacheEnabled: function() {
      if (!this.storage || !this.channel) {
        return false;
      }

      // TODO check if caching is enabled on the channel

      return true;
    },
    setState: function(courseID, actor, stateId, registration, state, callback) {
      // Update states generation date
      state.generated = (new Date()).toISOString();

      this.setCachedState(state);

      // Push data to remote LRS
      this.wrapper.sendState(courseID, actor, stateId, registration, state, null, null, _.bind(function(res, result) {        
        if (res.readyState === 4 && (res.status === 200 || res.status === 204)) {
          return callback(null, true);
        }

        return callback(null, false);
      }, this));
    },
    getState: function(courseID, actor, stateId, registration, callback) {
      console.log('xapiChannelCache ' + this.channel._name + ' getting state');
      // 5th param is 'since', we're not using it. 4th param sh/b this._REGISTRATION
      this.wrapper.getState(courseID, actor, stateId, registration, null, _.bind(function(res, result) {
        // TODO Check if request failed. We may not beable to check errors until an issue with the xapi wrapper
        // is addressed https://github.com/adlnet/xAPIWrapper/issues/80
        
        var cache = this.getCachedState();

        // If no data from server or error, use cache (or empty object returned by cache)
        if (!result || _.isArray(result) || result.error) {
          console.log('xapiChannelCache ' + this.channel._name + ' error getting LRS state, using cached/empty state');
          return callback(null, cache);
        }

        // If result is old (no generation date) use cache if generation date present
        if (!result.generated && cache.generated) {
          console.log('xapiChannelCache ' + this.channel._name + ' cached state appears to be newer, using cached');
          return callback(null, cache);
        }
        
        // If cached value is newer then server value use the cached value
        if (Date.parse(result.generated) < Date.parse(cache.generated)) {
          console.log('xapiChannelCache ' + this.channel._name + ' cache state is newer/same, using cached');
          return callback(null, cache);
        }

        // Use server state
        console.log('xapiChannelCache ' + this.channel._name + ' is using LRS state');
        return callback(null, result);
      }, this));
    },
    sendStatement: function(statement, callback) {
      if (this.channel._isFakeLRS) {
        console.log('xapiChannelCache ' + this.channel._name + ': FAKE POST of statement:', statement);
        return callback();
      }

      this.addStatementToCache(statement);
      this.sendStatements(callback);
    },
    sendStatements: function(callback) {
      if (this.channel._isFakeLRS) {
        return callback();
      }
      
      // Avoid sending duplicates due to race condition
      // If a request is already in flight do not start another one
      if (this.pending >= 1) {
        console.log('xapiChannelCache ' + this.channel._name + ' already sending');
        return callback();
      }

      // Track how many inflight requests. We only allow one inflight request at a time
      // to deal with race conditions in the statement queue handling
      this.pending++;
      
      var statements = this.getCachedStatements();
      console.log('xapiChannelCache ' + this.channel._name + ': sending statements', statements);

      // TODO max statements to send in one request should be configurable
      var payload = statements.slice(0, 25);

      this.wrapper.sendStatement(payload, _.bind(function(res, result) {
        // Check if request failed. We may not beable to check errors until an issue with the xapi wrapper
        // is addressed https://github.com/adlnet/xAPIWrapper/issues/80
        if (res.status >= 400) {
          console.log('xapiChannelCache ' + this.channel._name + ': failed to send statements', res.status);
          this.setupRetry();
          return callback(new Error('Error sending statement(s)'));
        }

        // We had a successful requst, clear any pending request
        this.clearRetry();
        
        console.log('xapiChannelCache ' + this.channel._name + ': sent ' + payload.length + ' statement');

        // Re-get the cache as statements may have been added
        var cached = this.getCachedStatements();
        // Get statements that were not sent in this batch
        var remaining = cached.slice(payload.length);

        // If any statements were not send, prepare to resend
        this.setCachedStatements(remaining);

        // We are done with the queue, we can let another request happen
        this.pending--;

        // If there are still statements to send, do it
        if (remaining.length > 0) {
          console.log('xapiChannelCache' + this.channel._name + ' queue contains ' + remaining.length + ' statements');
          return this.sendStatements(callback);          
        }

        console.log('xapiChannelCache ' + this.channel._name + ' queue is empty');
        
        return callback();
      }, this));
    },
    setupRetry: function() {
      // Retry already in progress, clear it and delay more
      this.clearRetry();
          
      // Wait a while and try again
      this.retryTimer = setTimeout(_.bind(function() {
        // Clear any existing retrys
        this.clearRetry();
        this.sendStatements();
      }, this), 30000); // 30 seconds
    },
    clearRetry: function() {
      if (this.retryTimer) {
        clearTimeout(this.retryTimer);
        this.retryTimer = null;
      }
    },
    getCachedState: function() {
      if (!this.isCacheEnabled()) {
        return {};
      }

      var state = this.storage.getItem('xapi_state');
      // If null/falsey then no data, return empty state object
      if (!state) {
        return {};
      }

      try {
        return JSON.parse(state);
      } catch(e) {
        console.log('xapiChannelCache' + this.channel._name + ' error getting state cache ' + e.message);
      }

      return {};;
    },
    setCachedState: function(state) {
      if (!this.isCacheEnabled()) {
        return;
      }      
      
      this.storage.setItem('xapi_state', JSON.stringify(state));
    },
    addStatementToCache: function(statement) {
      var statements = this.getCachedStatements();
      statements.push(message);
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
        console.log('Error parsing cached xAPI statements', e, statements);
        return [];
      }

      // If retieved statements are not valid return empty array
      if (!this.isValidStatementsArray(statements)) {
        cosole.log('Invalid statement data', statements);
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
    isValidStatementsArray: function(statements) {
      return (statements && statements instanceof Array);
    }
  };

  return Cache;
})
