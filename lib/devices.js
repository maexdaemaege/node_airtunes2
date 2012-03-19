var events = require('events'),
    util = require('util'),
    async = require('async'),
    CoreAudioDevice = require('./device_coreaudio.js'),
    AirTunesDevice = require('./device_airtunes.js'),
    audioOut = require('./audio_out.js'),
    config = require('./config.js');

function Devices() {
  events.EventEmitter.call(this);

  this.source = null;
  this.devices = {};
  this.hasAirTunes = false;
};

util.inherits(Devices, events.EventEmitter);

Devices.prototype.init = function() {
  var self = this;
  audioOut.on('need_sync', function(seq) {
    // relay to all devices
    self.forEach(function(dev) {
      if(dev.onSyncNeeded)
        dev.onSyncNeeded(seq);
    });
  });
};

Devices.prototype.forEach = function(it) {
  for(var i in this.devices) {
    if(!this.devices.hasOwnProperty(i))
      continue;

    it(this.devices[i], i);
  }
};

Devices.prototype.add = function(type, host, options) {
  var self = this;
  options = options || {};

  var dev = type === 'coreaudio' ?
    new CoreAudioDevice(this.hasAirTunes, options) :
    new AirTunesDevice(host, options);

  var previousDev = this.devices[dev.key];
  
  if(previousDev) {
    // if device is already in the pool, just report its existing status.
    previousDev.reportStatus();

    return previousDev;
  }

  this.devices[dev.key] = dev;

  dev.on('status', function(status, arg) {
    if(status === 'error' || status === 'stopped') {
      delete self.devices[dev.key];
      self.checkAirTunesDevices();
    }

    if(this.hasAirTunes && status === 'playing') {
      self.emit('need_sync');
    }
  });

  this.checkAirTunesDevices();
  dev.start();

  return dev;
};

Devices.prototype.setVolume = function(key, volume) {
  var dev = this.devices[key];

  if(!dev) {
    this.emit('status', key, 'error', 'not_found');

    return;
  }

  dev.setVolume(volume);
};

Devices.prototype.stopAll = function(allCb) {
  async.forEach(
    this.devices, 
    function(dev, cb) {
      dev.stop(cb);
    },
    function() {
      this.devices = {};
      allCb();
    }
  );
};

Devices.prototype.checkAirTunesDevices = function() {
  var newHasAirTunes = false;

  for(var host in this.devices) {
    if(!this.devices.hasOwnProperty(host))
      continue;

    if(this.devices[host].type === 'airtunes') {
      newHasAirTunes = true;
      break;
    }
  }

  if(newHasAirTunes !== this.hasAirTunes) {
    this.emit('airtunes_devices', newHasAirTunes);

    this.forEach(function(dev) {
      if(dev.setHasAirTunes)
        dev.setHasAirTunes(newHasAirTunes);
    });
  }

  this.hasAirTunes = newHasAirTunes;
};

module.exports = new Devices();