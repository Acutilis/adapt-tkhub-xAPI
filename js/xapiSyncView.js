define([
  'core/js/adapt',
  'core/js/views/componentView',
  './xapiChannelHandler'
], function(Adapt, ComponentView, ChannelHandler) {
  var xAPISync = ComponentView.extend({
    events: {
      "click .xAPISync-button": "onSync"
    },
    setComplete: function() {
      // If not already marked as complete, mark it
      if (!this.model.get('_isComplete')) {
        this.setCompletionStatus();
      }

      // Update state to reflect completion
      this.$('.xAPISync-body-inner').html(this.model.get('successMessage'));
      this.$('.buttons').addClass('submitted');
      this.$('.xAPISync-button').addClass('disabled');
      this.$('.xAPISync-button').prop('disabled', true);
    },
    showSuccess: function() {
      var success = {
        'title': this.model.get('successTitle'),
        'body': this.model.get('successMessage')
      };

      Adapt.trigger('notify:popup', success);
    },
    showError: function(err) {
      var message = this.model.get('errorMessage');
      message += '<p class="error">' + err.message + '</p>';
      
      var error = {
        'title': this.model.get('errorTitle'),
        'body': message
      };

      Adapt.trigger('notify:popup', error);
    },
    onSync: function(event) {
      // Check if all statements are sent
      if (!ChannelHandler.hasPendingStatements()) {
        //return this.setComplete();
      }

      // Perform sync/send statements
      return ChannelHandler.sendPendingStatements(function(err) {
        // TODO should no longer show working indicator
        if (err) {
          console.log(err);
          this.showError(err);
          return;
        }

        this.showSuccess();
        this.setComplete();
      }.bind(this));
    },
    postRender: function() {
      if (this.model.get("_isComplete")) {
        this.setComplete();
      }

      this.setReadyStatus();
    }
  });

  Adapt.register('xAPISync', xAPISync);

  return xAPISync;
});
