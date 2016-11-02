'use strict';

const _ = require('lodash');

const validateSession = require('./lib/security/validateSession');
const checkAccess = require('./lib/security/checkAccess');
const getEventsBulk = require('./lib/models/event/getBulk');
const getActors = require('./lib/models/actor/gets');
const getObjects = require('./lib/models/object/gets');
const addDisplayTitles = require('./lib/models/event/addDisplayTitles');

const handler = (event, context, cb) => {
  let events;
  let claims;

  validateSession({
    jwt_source: 'viewer',
    event,
  })
  .then((c) => {
    claims = c;
    return getEventsBulk({
      project_id: event.path.projectId,
      environment_id: claims.environment_id,
      event_ids: event.body.event_ids,
    });
  })
  .then((ev) => {
    events = ev;
    return getActors({
      actor_ids: _.map(events, (e) => {
        return e.actor_id;
      }),
    });
  })
  .then((actors) => {
    // TODO(zhaytee): This is pretty inefficient.
    _.forEach(events, (e) => {
      e.actor = _.find(actors, { id: e.actor_id });
    });
    
    return getObjects({
      object_ids: _.map(events, (e) => {
        return e.object_id;
      }),
    });
  })
  .then((objects) => {
    // TODO this is pretty inefficient
    _.forEach(events, (e) => {
      e.object = _.find(objects, { id: e.object_id });
    });

    return addDisplayTitles({
      events: events,
      project_id: event.path.projectId,
      environment_id: claims.environment_id,
    })
  })
  .then((event) => {
    cb(null, { events });
  })
  .catch((err) => {
    cb(err);
  });
};

if (require('./lib/config/getConfig')().IOPipe.ClientID) {
  const iopipe = require('iopipe')({
    clientId: require('./lib/config/getConfig')().IOPipe.ClientID,
  });

  module.exports.default = iopipe(handler);
} else {
  module.exports.default = handler;
}