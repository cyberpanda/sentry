import $ from 'jquery';
import _ from 'lodash';

import GroupActions from './actions/groupActions';
import TeamActions from './actions/teamActions';

export class Request {
  constructor(xhr) {
    this.xhr = xhr;
    this.alive = true;
  }

  cancel() {
    this.alive = false;
    this.xhr.abort();
  }
}

let RESPONSES = {GET: {}, POST: {}, PUT: {}, DELETE: {}};

function demo_response_for_url(method, url, original) {
  let response;

  if (url === '/api/0/projects/sentry/earth/' && method == 'PUT') {
    response = RESPONSES.GET[url];
    _.merge(response, original);
  }

  return response;
}

function demo_response(method, url, response) {
  let deferred = $.Deferred();
  let mocked = demo_response_for_url(method, url, response) || response;

  setTimeout(function() {
    deferred.resolve(mocked);
  }, 500);
  return deferred.promise();
}

/**
 * Converts input parameters to API-compatible query arguments
 * @param params
 */
export function paramsToQueryArgs(params) {
  return params.itemIds
    ? {id: params.itemIds} // items matching array of itemids
    : params.query
      ? {query: params.query} // items matching search query
      : undefined; // all items
}

export class Client {
  constructor(options) {
    if (_.isUndefined(options)) {
      options = {};
    }
    this.baseUrl = options.baseUrl || '/api/0';
    this.activeRequests = {};
  }

  uniqueId() {
    let s4 = () => {
      return Math.floor((1 + Math.random()) * 0x10000)
        .toString(16)
        .substring(1);
    };
    return s4() + s4() + '-' + s4() + '-' + s4() + '-' + s4() + '-' + s4() + s4() + s4();
  }

  wrapCallback(id, func, cleanup) {
    /*eslint consistent-return:0*/
    if (_.isUndefined(func)) {
      return;
    }

    return (...args) => {
      let req = this.activeRequests[id];
      if (cleanup === true) {
        delete this.activeRequests[id];
      }
      if (req && req.alive) {
        if (window.demo && req.xhr.url) {
          RESPONSES[req.xhr.method][req.xhr.url] = req.xhr.responseJSON;
        }
        return func.apply(req, args);
      }
    };
  }

  clear() {
    for (let id in this.activeRequests) {
      this.activeRequests[id].cancel();
    }
  }

  request(path, options = {}) {
    let query = $.param(options.query || '', true);
    let method = options.method || (options.data ? 'POST' : 'GET');
    let data = options.data;
    let id = this.uniqueId();

    if (!_.isUndefined(data) && method !== 'GET') {
      data = JSON.stringify(data);
    }

    let fullUrl;
    if (path.indexOf(this.baseUrl) === -1) {
      fullUrl = this.baseUrl + path;
    } else {
      fullUrl = path;
    }
    if (query) {
      if (fullUrl.indexOf('?') !== -1) {
        fullUrl += '&' + query;
      } else {
        fullUrl += '?' + query;
      }
    }

    let headers = {
      'Accept': 'application/json; charset=utf-8'
    };

    if (window.demo) {
      headers['X-Demo'] = true;
    }

    if (!window.demo || (window.demo && method === 'GET')) {
      this.activeRequests[id] = new Request(
        $.ajax({
          url: fullUrl,
          method,
          data,
          contentType: 'application/json',
          headers,
          beforeSend: function(jqxhr, settings) { jqxhr.url = fullUrl; jqxhr.method = method; },
          success: this.wrapCallback(id, options.success),
          error: this.wrapCallback(id, options.error),
          complete: this.wrapCallback(id, options.complete, true),
        })
      );
    } else {
      this.activeRequests[id] = new Request(
        demo_response(method, fullUrl, options.data).then(
          this.wrapCallback(id, options.success)
        ).always(
          this.wrapCallback(id, options.complete, true)
        )
      );
    }

    return this.activeRequests[id];
  }

  _chain(...funcs) {
    funcs = funcs.filter(f => !_.isUndefined(f) && f);
    return (...args) => {
      funcs.forEach(func => {
        func.apply(funcs, args);
      });
    };
  }

  _wrapRequest(path, options, extraParams) {
    if (_.isUndefined(extraParams)) {
      extraParams = {};
    }

    options.success = this._chain(options.success, extraParams.success);
    options.error = this._chain(options.error, extraParams.error);
    options.complete = this._chain(options.complete, extraParams.complete);

    return this.request(path, options);
  }

  bulkDelete(params, options) {
    let path = '/projects/' + params.orgId + '/' + params.projectId + '/issues/';
    let query = paramsToQueryArgs(params);
    let id = this.uniqueId();

    GroupActions.delete(id, params.itemIds);

    return this._wrapRequest(
      path,
      {
        query,
        method: 'DELETE',
        success: response => {
          GroupActions.deleteSuccess(id, params.itemIds, response);
        },
        error: error => {
          GroupActions.deleteError(id, params.itemIds, error);
        },
      },
      options
    );
  }

  bulkUpdate(params, options) {
    let path = '/projects/' + params.orgId + '/' + params.projectId + '/issues/';
    let query = paramsToQueryArgs(params);
    let id = this.uniqueId();

    GroupActions.update(id, params.itemIds, params.data);

    return this._wrapRequest(
      path,
      {
        query,
        method: 'PUT',
        data: params.data,
        success: response => {
          GroupActions.updateSuccess(id, params.itemIds, response);
        },
        error: error => {
          GroupActions.updateError(id, params.itemIds, error, params.failSilently);
        },
      },
      options
    );
  }

  merge(params, options) {
    let path = '/projects/' + params.orgId + '/' + params.projectId + '/issues/';
    let query = paramsToQueryArgs(params);
    let id = this.uniqueId();

    GroupActions.merge(id, params.itemIds);

    return this._wrapRequest(
      path,
      {
        query,
        method: 'PUT',
        data: {merge: 1},
        success: response => {
          GroupActions.mergeSuccess(id, params.itemIds, response);
        },
        error: error => {
          GroupActions.mergeError(id, params.itemIds, error);
        },
      },
      options
    );
  }

  assignTo(params, options) {
    let path = '/issues/' + params.id + '/';
    let id = this.uniqueId();

    GroupActions.assignTo(id, params.id, {
      email: (params.member && params.member.email) || '',
    });

    return this._wrapRequest(
      path,
      {
        method: 'PUT',
        // Sending an empty value to assignedTo is the same as "clear",
        // so if no member exists, that implies that we want to clear the
        // current assignee.
        data: {assignedTo: (params.member && params.member.id) || ''},
        success: response => {
          GroupActions.assignToSuccess(id, params.id, response);
        },
        error: error => {
          GroupActions.assignToError(id, params.id, error);
        },
      },
      options
    );
  }

  joinTeam(params, options) {
    let path =
      '/organizations/' +
      params.orgId +
      '/members/' +
      (params.memberId || 'me') +
      '/teams/' +
      params.teamId +
      '/';
    let id = this.uniqueId();

    TeamActions.update(id, params.teamId);

    return this._wrapRequest(
      path,
      {
        method: 'POST',
        success: response => {
          TeamActions.updateSuccess(id, params.teamId, response);
        },
        error: error => {
          TeamActions.updateError(id, params.teamId, error);
        },
      },
      options
    );
  }

  leaveTeam(params, options) {
    let path =
      '/organizations/' +
      params.orgId +
      '/members/' +
      (params.memberId || 'me') +
      '/teams/' +
      params.teamId +
      '/';
    let id = this.uniqueId();

    TeamActions.update(id, params.teamId);

    return this._wrapRequest(
      path,
      {
        method: 'DELETE',
        success: response => {
          TeamActions.updateSuccess(id, params.teamId, response);
        },
        error: error => {
          TeamActions.updateError(id, params.teamId, error);
        },
      },
      options
    );
  }
}
