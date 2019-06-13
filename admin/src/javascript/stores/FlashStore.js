import * as Reflux from 'reflux';

import FlashActions from '../actions/FlashActions';

var FlashStore = Reflux.createStore({
  listenables: [FlashActions],

  init: function() {
    this.flashes = [];
  },

  getInitialState: function() {
    return this.flashes;
  },

  onFlash: function(message, severity) {
    this.flashes.push(this.makeFlash(message, severity));
    this.trigger(this.flashes);
  },

  makeFlash: function(message, severity) {
    return {message: message, severity: severity || 'success'};
  },

  onClear: function() {
    this.flashes = [];
  }
});

export default FlashStore;
