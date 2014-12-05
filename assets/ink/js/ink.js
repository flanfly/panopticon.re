/**
 * Ink Core.
 * @module Ink_1
 * This module provides the necessary methods to create and load the modules using Ink.
 */

;(function(window, document) {

    'use strict';

    // skip redefinition of Ink core
    if ('Ink' in window) { return; }


    // internal data

    /*
     * NOTE:
     * invoke Ink.setPath('Ink', '/Ink/'); before requiring local modules
     */
    var paths = {};
    var modules = {};
    var modulesLoadOrder = [];
    var modulesRequested = {};
    var pendingRMs = [];
    var modulesWaitingForDeps = {};

    var apply = Function.prototype.apply;

    // auxiliary fns
    var isEmptyObject = function(o) {
        /*jshint unused:false */
        if (typeof o !== 'object') { return false; }
        for (var k in o) {
            if (o.hasOwnProperty(k)) {
                return false;
            }
        }
        return true;
    };

    /**
     * @namespace Ink_1
     */

    window.Ink = {
        VERSION: '3.0.5',
        _checkPendingRequireModules: function() {
            var I, F, o, dep, mod, cb, pRMs = [];
            for (I = 0, F = pendingRMs.length; I < F; ++I) {
                o = pendingRMs[I];

                if (!o) { continue; }

                for (dep in o.left) {
                    if (o.left.hasOwnProperty(dep)) {
                        mod = modules[dep];
                        if (mod) {
                            o.args[o.left[dep] ] = mod;
                            delete o.left[dep];
                            --o.remaining;
                        }
                    }
                }

                if (o.remaining > 0) {
                    pRMs.push(o);
                }
                else {
                    cb = o.cb;
                    if (!cb) { continue; }
                    delete o.cb; // to make sure I won't call this more than once!
                    cb.apply(false, o.args);
                }
            }

            pendingRMs = pRMs;

            if (pendingRMs.length > 0) {
                setTimeout( function() { Ink._checkPendingRequireModules(); }, 0 );
            }
        },

        /**
         * Get the full path of a module.
         * This method looks up the paths given in setPath (and ultimately the default Ink's path).
         *
         * @method getPath
         * @param {String}  key      Name of the module you want to get the path
         * @param {Boolean} [noLib] Flag to skip appending 'lib.js' to the returned path.
         */
        getPath: function(key, noLib) {
            var split = key.split(/[._]/g);
            var curKey;
            var i;
            var root;
            var path;

            // Look for Ink.Dom.Element.1, Ink.Dom.Element, Ink.Dom, Ink in this order.
            for (i = split.length; i >= 0; i -= 1) {
                curKey = split.slice(0, i + 1).join('.');  // See comment in setPath
                if (paths[curKey]) {
                    root = curKey;
                    break;
                }
            }

            if (root in paths) {
                path = paths[root];
            } else {
                return null;
            }

            if (!/\/$/.test(path)) {
                path += '/';
            }
            if (i < split.length) {
                // Add the rest of the path. For example, if we found
                // paths['Ink.Dom'] to be 'http://example.com/Ink/Dom/',
                // we now add '/Element/' to get the full path.
                path += split.slice(i + 1).join('/') + '/';
            }
            if (!noLib) {
                path += 'lib.js';
            }
            return path;
        },
        
        /**
         * Sets the URL path for a namespace.
         * Use this to customize where requireModules and createModule will load dependencies from.
         * This can be useful to set your own CDN for dynamic module loading or simply to change your module folder structure
         * 
         * @method setPath
         *
         * @param {String} key       Module or namespace
         * @param {String} rootURI   Base URL path and schema to be appended to the module or namespace
         *
         * @example
         *      Ink.setPath('Ink', 'http://my-cdn/Ink/');
         *      Ink.setPath('Lol', 'http://my-cdn/Lol/');
         *
         *      // Loads from http://my-cdn/Ink/Dom/Whatever/lib.js
         *      Ink.requireModules(['Ink.Dom.Whatever'], function () { ... });
         *      // Loads from http://my-cdn/Lol/Whatever/lib.js
         *      Ink.requireModules(['Lol.Whatever'], function () { ... });
         */
        setPath: function(key, rootURI) {
            // Replacing version separator with dot because the difference
            // between a submodule and a version doesn't matter here.
            // It would also overcomplicate the implementation of getPath
            paths[key.replace(/_/, '.')] = rootURI;
        },

        /**
         * Loads a script URL.
         * This creates a `script` tag in the `head` of the document.
         * Reports errors by listening to 'error' and 'readystatechange' events.
         *
         * @method loadScript
         * @param {String}  uri  Can be an external URL or a module name
         * @param {String}  [contentType]='text/javascript' The `type` attribute of the new script tag.
         */
        loadScript: function(uri, contentType) {
            /*jshint evil:true */

            if (uri.indexOf('/') === -1) {
                var givenUri = uri;  // For the error message
                uri = this.getPath(uri);
                if (uri === null) {
                    throw new Error('Could not load script "' + givenUri + '". ' +
                        'Path not found in the registry. Did you misspell ' +
                        'the name, or forgot to call setPath()?');
                }
            }

            var scriptEl = document.createElement('script');
            scriptEl.setAttribute('type', contentType || 'text/javascript');
            scriptEl.setAttribute('src', uri);

            scriptEl.onerror = scriptEl.onreadystatechange = function (ev) {
                ev = ev || window.event;
                if (ev.type === 'readystatechange' && scriptEl.readyState !== 'loaded') {
                    // if not readyState == 'loaded' it's not an error.
                    return;
                }
                Ink.error(['Failed to load script from ', uri, '.'].join(''));
            };
            // CHECK ON ALL BROWSERS
            /*if (document.readyState !== 'complete' && !document.body) {
                document.write( scriptEl.outerHTML );
            }
            else {*/
                var aHead = document.getElementsByTagName('head');
                if(aHead.length > 0) {
                    aHead[0].appendChild(scriptEl);
                }
            //}
        },

        _loadLater: function (dep) {
            setTimeout(function () {
                if (modules[dep] || modulesRequested[dep] ||
                        modulesWaitingForDeps[dep]) {
                    return;
                }
                modulesRequested[dep] = true;
                Ink.loadScript(dep);
            }, 0);
        },

        /**
         * Defines a module namespace.
         *
         * @method namespace
         * @param  {String}   ns                    Namespace to define.
         * @param  {Boolean}  [returnParentAndKey]  Flag to change the return value to an array containing the namespace parent and the namespace key
         * @return {Object|Array} Returns the created namespace object
         */
        namespace: function(ns, returnParentAndKey) {
            if (!ns || !ns.length) { return null; }

            var levels = ns.split('.');
            var nsobj = window;
            var parent;

            for (var i = 0, f = levels.length; i < f; ++i) {
                nsobj[ levels[i] ] = nsobj[ levels[i] ] || {};
                parent = nsobj;
                nsobj = nsobj[ levels[i] ];
            }

            if (returnParentAndKey) {
                return [
                    parent,
                    levels[i-1]
                ];
            }

            return nsobj;
        },

        /**
         * Loads a module.
         * A synchronous method to get the module from the internal registry.
         * It assumes the module is defined and loaded already!
         *
         * @method getModule
         * @param  {String}  mod        Module name
         * @param  {Number}  [version]  Version number of the module
         * @return {Object|Function}    Module object or function, depending how the module is defined
         */
        getModule: function(mod, version) {
            var key = version ? [mod, '_', version].join('') : mod;
            return modules[key];
        },

        /**
         * Creates a new module. 
         * Use this to wrap your code and benefit from the module loading used throughout the Ink library
         *
         * @method createModule
         * @param  {String}    mod      Module name, separated by dots. Like Ink.Dom.Selector, Ink.UI.Modal
         * @param  {Number}    version  Version number
         * @param  {Array}     deps     Array of module names which are dependencies of the module being created. The order in which they are passed here will define the order they will be passed to the callback function.
         * @param  {Function}  modFn    The callback function to be executed when all the dependencies are resolved. The dependencies are passed as arguments, in the same order they were declared. The function itself should return the module.
         * @sample Ink_1_createModule.html 
         *
         */
        createModule: function(mod, ver, deps, modFn) { // define
            if (typeof mod !== 'string') {
                throw new Error('module name must be a string!');
            }

            // validate version correctness
            if (!(typeof ver === 'number' || (typeof ver === 'string' && ver.length > 0))) {
                throw new Error('version number missing!');
            }

            var modAll = [mod, '_', ver].join('');

            modulesWaitingForDeps[modAll] = true;

            var cb = function() {
                //console.log(['createModule(', mod, ', ', ver, ', [', deps.join(', '), '], ', !!modFn, ')'].join(''));

                // make sure module in not loaded twice
                if (modules[modAll]) {
                    //console.warn(['Ink.createModule ', modAll, ': module has been defined already.'].join(''));
                    return;
                }


                // delete related pending tasks
                delete modulesRequested[modAll];
                delete modulesRequested[mod];


                // run module's supplied factory
                var args = Array.prototype.slice.call(arguments);
                var moduleContent = modFn.apply(window, args);
                modulesLoadOrder.push(modAll);
                // console.log('** loaded module ' + modAll + '**');


                // set version
                if (typeof moduleContent === 'object') { // Dom.Css Dom.Event
                    moduleContent._version = ver;
                }
                else if (typeof moduleContent === 'function') {
                    moduleContent.prototype._version = ver; // if constructor
                    moduleContent._version = ver;           // if regular function
                }


                // add to global namespace...
                var isInkModule = mod.indexOf('Ink.') === 0;
                var t;
                if (isInkModule) {
                    t = Ink.namespace(mod, true); // for mod 'Ink.Dom.Css', t[0] gets 'Ink.Dom' object and t[1] 'Css'
                }


                // versioned
                modules[ modAll ] = moduleContent; // in modules
                delete modulesWaitingForDeps[ modAll ];

                if (isInkModule) {
                    t[0][ t[1] + '_' + ver ] = moduleContent; // in namespace
                }


                // unversioned
                modules[ mod ] = moduleContent; // in modules

                if (isInkModule) {
                    if (isEmptyObject( t[0][ t[1] ] )) {
                        t[0][ t[1] ] = moduleContent; // in namespace
                    }
                    // else {
                        // console.warn(['Ink.createModule ', modAll, ': module has been defined already with a different version!'].join(''));
                    // }
                }


                if (this) { // there may be pending requires expecting this module, check...
                    Ink._checkPendingRequireModules();
                }
            };

            this.requireModules(deps, cb);
        },

        /**
         * Requires modules asynchronously 
         * Use this to get modules, even if they're not loaded yet
         *
         * @method requireModules
         * @param  {Array}     deps  Array of module names. The order in which they are passed here will define the order they will be passed to the callback function. 
         * @param  {Function}  cbFn  The callback function to be executed when all the dependencies are resolved. The dependencies are passed as arguments, in the same order they were declared.
         * @sample Ink_1_requireModules.html 
         */
        requireModules: function(deps, cbFn) { // require
            //console.log(['requireModules([', deps.join(', '), '], ', !!cbFn, ')'].join(''));
            var i, f, o, dep, mod;
            f = deps && deps.length;
            o = {
                args: new Array(f),
                left: {},
                remaining: f,
                cb: cbFn
            };

            if (!(typeof deps === 'object' && deps.length !== undefined)) {
                throw new Error('Dependency list should be an array!');
            }
            if (typeof cbFn !== 'function') {
                throw new Error('Callback should be a function!');
            }

            for (i = 0; i < f; ++i) {
                if (Ink._moduleRenames[deps[i]]) {
                    Ink.warn(deps[i] + ' was renamed to ' + Ink._moduleRenames[deps[i]]);
                    dep = Ink._moduleRenames[deps[i]];
                } else {
                    dep = deps[i];
                }

                // Because trailing commas in oldIE bring us undefined values here
                if (!dep) {
                    --o.remaining;
                    continue;
                }

                mod = modules[dep];
                if (mod) {
                    o.args[i] = mod;
                    --o.remaining;
                    continue;
                }
                else if (!modulesRequested[dep]) {
                    Ink._loadLater(dep);
                }
                o.left[dep] = i;
            }

            if (o.remaining > 0) {
                pendingRMs.push(o);
            }
            else {
                cbFn.apply(true, o.args);
            }
        },

        _moduleRenames: {
            'Ink.UI.Aux_1': 'Ink.UI.Common_1'
        },

        /**
         * Lists loaded module names.
         * The list is ordered by loaded time (oldest module comes first)
         *
         * @method getModulesLoadOrder
         * @return {Array} returns the order in which modules were resolved and correctly loaded
         */
        getModulesLoadOrder: function() {
            return modulesLoadOrder.slice();
        },

        /**
         * Builds the markup needed to load the modules.
         * This method builds the script tags needed to load the currently used modules
         * 
         * @method getModuleScripts
         * @uses getModulesLoadOrder
         * @return {String} The script markup
         */
        getModuleScripts: function() {
            var mlo = this.getModulesLoadOrder();
            mlo.unshift('Ink_1');
            mlo = mlo.map(function(m) {
                return ['<scr', 'ipt type="text/javascript" src="', Ink.getModuleURL(m), '"></scr', 'ipt>'].join('');
            });

            return mlo.join('\n');
        },
        
        /**
         * Creates an Ink.Ext module
         *
         * Does exactly the same as createModule but creates the module in the Ink.Ext namespace
         *
         * @method createExt
         * @uses createModule
         * @param {String} moduleName   Extension name
         * @param {String} version  Extension version
         * @param {Array}  dependencies Extension dependencies
         * @param {Function} modFn  Function returning the extension
         * @sample Ink_1_createExt.html 
         */
        createExt: function (moduleName, version, dependencies, modFn) {
            return Ink.createModule('Ink.Ext.' + moduleName, version, dependencies, modFn);
        },

        /**
         * Function.prototype.bind alternative.
         * Creates a new function that, when called, has its this keyword set to the provided value, with a given sequence of arguments preceding any provided when the new function is called.
         *
         * @method bind
         * @param {Function}  fn        The function 
         * @param {Object}    context   The value to be passed as the this parameter to the target function when the bound function is called. If used as false, it preserves the original context and just binds the arguments.
         * @param {Any}   [args*]     Additional arguments will be sent to the original function as prefix arguments.
         * @return {Function}
         * @sample Ink_1_bind.html 
         */
        bind: function(fn, context) {
            var args = Array.prototype.slice.call(arguments, 2);
            return function() {
                var innerArgs = Array.prototype.slice.call(arguments);
                var finalArgs = args.concat(innerArgs);
                return fn.apply(context === false ? this : context, finalArgs);
            };
        },

        /**
         * Function.prototype.bind alternative for class methods
         * Creates a new function that, when called, has this k
         * @method bindMethod
         * @uses bind
         * @param {Object}  object      The object that contains the method to bind
         * @param {String}  methodName  The name of the method that will be bound
         * @param {Any}   [args*]     Additional arguments will be sent to the new method as prefix arguments.
         * @return {Function}
         * @sample Ink_1_bindMethod.html 
         */
        bindMethod: function (object, methodName) {
            return Ink.bind.apply(Ink,
                [object[methodName], object].concat([].slice.call(arguments, 2)));
        },

        /**
         * Function.prototype.bind alternative for event handlers.
         * Same as bind but keeps first argument of the call the original event.
         * Set "context" to `false` to preserve the original context of the function and just bind the arguments.
         *
         * @method bindEvent
         * @param {Function}  fn        The function 
         * @param {Object}    context   The value to be passed as the this parameter to the target 
         * @param {Any}     [args*]   Additional arguments will be sent to the original function as prefix arguments
         * @return {Function}
         * @sample Ink_1_bindEvent.html 
         */
        bindEvent: function(fn, context) {
            var args = Array.prototype.slice.call(arguments, 2);
            return function(event) {
                var finalArgs = args.slice();
                finalArgs.unshift(event || window.event);
                return fn.apply(context === false ? this : context, finalArgs);
            };
        },

        /**
         * Alias to document.getElementById
         *
         * @method i
         * @param {String} id Element ID
         * @return {DOMElement}
         * @sample Ink_1_i.html 
         */
        i: function(id) {
            if(!id) {
                throw new Error('Ink.i => id or element must be passed');
            }
            if(typeof(id) === 'string') {
                return document.getElementById(id);
            }
            return id;
        },

        /**
         * Alias for Ink.Dom.Selector
         *
         * @method ss
         * @uses Ink.Dom.Selector.select
         * @param {String}     rule
         * @param {DOMElement} [from]
         * @return {Array} array of DOMElements
         * @sample Ink_1_ss.html 
         */
        ss: function(rule, from)
        {
            if(typeof(Ink.Dom) === 'undefined' || typeof(Ink.Dom.Selector) === 'undefined') {
                throw new Error('This method requires Ink.Dom.Selector');
            }
            return Ink.Dom.Selector.select(rule, (from || document));
        },

        /**
         * Alias for Ink.Dom.Selector first result
         *
         * @method s
         * @uses Ink.Dom.Selector.select
         * @param {String}     rule     Selector string
         * @param {DOMElement} [from]   Context element. If set to a DOM element, the rule will only look for descendants of this DOM Element.
         * @return {DOMElement}
         * @sample Ink_1_s.html 
         */
        s: function(rule, from)
        {
            if(typeof(Ink.Dom) === 'undefined' || typeof(Ink.Dom.Selector) === 'undefined') {
                throw new Error('This method requires Ink.Dom.Selector');
            }
            return Ink.Dom.Selector.select(rule, (from || document))[0] || null;
        },

        /**
         * Extends an object with another
         * Copy all of the properties in one or more source objects over to the destination object, and return the destination object. It's in-order, so the last source will override properties of the same name in previous arguments.
         *
         * @method extendObj
         * @param {Object} destination  The object that will receive the new/updated properties
         * @param {Object} source       The object whose properties will be copied over to the destination object
         * @param {Object} [args*]      Additional source objects. The last source will override properties of the same name in the previous defined sources
         * @return destination object, enriched with defaults from the sources
         * @sample Ink_1_extendObj.html 
         */
        extendObj: function(destination/*, source... */) {
            var sources = [].slice.call(arguments, 1);

            for (var i = 0, len = sources.length; i < len; i++) {
                if (!sources[i]) { continue; }
                for (var property in sources[i]) {
                    if(Object.prototype.hasOwnProperty.call(sources[i], property)) {
                        destination[property] = sources[i][property];
                    }
                }
            }

            return destination;
        },

        /**
         * Calls native console.log if available.
         *
         * @method log
         * @param {Any} [args*] Arguments to be evaluated
         * @sample Ink_1_log.html 
         **/
        log: function () {
            // IE does not have console.log.apply in IE10 emulated mode
            var console = window.console;
            if (console && console.log) {
                apply.call(console.log, console, arguments);
            }
        },

        /**
         * Calls native console.warn if available.
         *
         * @method warn
         * @param {Any} [args*] Arguments to be evaluated
         * @sample Ink_1_warn.html 
         **/
        warn: function () {
            // IE does not have console.log.apply in IE10 emulated mode
            var console = window.console;
            if (console && console.warn) {
                apply.call(console.warn, console, arguments);
            }
        },

        /**
         * Calls native console.error if available.
         *
         * @method error
         * @param {Any} [args*] Arguments to be evaluated
         * @sample Ink_1_error.html 
         **/
        error: function () {
            // IE does not have console.log.apply in IE10 emulated mode
            var console = window.console;
            if (console && console.error) {
                apply.call(console.error, console, arguments);
            }
        }
    };


    // TODO for debug - to detect pending stuff
    /*
    var failCount = {};   // fail count per module name
    var maxFails = 3;     // times
    var checkDelta = 0.5; //seconds

    var tmpTmr = setInterval(function() {
        var mk = Object.keys(modulesRequested);
        var l = mk.length;

        if (l > 0) {
            // console.log('** waiting for modules: ' + mk.join(', ') + ' **');

            for (var i = 0, f = mk.length, k, v; i < f; ++i) {
                k = mk[i];
                v = failCount[k];
                failCount[k] = (v === undefined) ? 1 : ++v;

                if (v >= maxFails) {
                    console.error('** Loading of module ' + k + ' failed! **');
                    delete modulesRequested[k];
                }
            }
        }
        else {
            // console.log('** Module loads complete. **');
            clearInterval(tmpTmr);
        }
    }, checkDelta*1000);
    */
}(window, document));

/**
 * Cross Browser Ajax requests
 * @module Ink.Net.Ajax_1
 * @version 1
 */

Ink.createModule('Ink.Net.Ajax', '1', [], function() {

    'use strict';

    /**
     * Creates a new XMLHttpRequest object
     *
     * @class Ink.Net.Ajax
     * @constructor
     *
     * @param {String}          url                             Request URL
     * @param {Object}          options                         Request options
     * @param {Boolean}         [options.asynchronous]=true     If false, the request synchronous.
     * @param {Boolean}         [options.cors]                  Flag to activate CORS. Set this to true if you're doing a cross-origin request
     * @param {String}          [options.method]='POST'         HTTP request method. POST by default.
     * @param {Object|String}   [options.parameters]            Request parameters to be sent with the request
     * @param {Number}          [options.timeout]               Request timeout in seconds
     * @param {Number}          [options.delay]                 Artificial delay. If the request is completed faster than this delay, wait the remaining time before executing the callbacks
     * @param {String}          [options.postBody]              POST request body. If not specified, it's filled with the contents from parameters
     * @param {String}          [options.contentType]           Content-type header to be sent. Defaults to 'application/x-www-form-urlencoded'
     * @param {Object}          [options.requestHeaders]        Key-value pairs for additional request headers
     * @param {Function}        [options.onComplete]            Callback executed after the request is completed, regardless of what happened during the request.
     * @param {Function}        [options.onSuccess]             Callback executed if the request is successful (requests with 2xx status codes)
     * @param {Function}        [options.onFailure]             Callback executed if the request fails (requests with status codes different from 2xx)
     * @param {Function}        [options.onException]           Callback executed if an exception occurs. Receives the exception as a parameter.
     * @param {Function}        [options.onCreate]              Callback executed after object initialization but before the request is made
     * @param {Function}        [options.onInit]                Callback executed before any initialization
     * @param {Function}        [options.onTimeout]             Callback executed if the request times out
     * @param {Boolean|String}  [options.evalJS]=true           If the request Content-type header is application/json, evaluates the response and populates responseJSON. Use 'force' if you want to force the response evaluation, no matter what Content-type it's using.
     * @param {Boolean}         [options.sanitizeJSON]          Flag to sanitize the content of responseText before evaluation
     * @param {String}          [options.xhrProxy]              URI for proxy service hosted on the same server as the web app, that can fetch documents from other domains. The service must pipe all input and output untouched (some input sanitization is allowed, like clearing cookies). e.g., requesting http://example.org/doc can become /proxy/http%3A%2F%2Fexample.org%2Fdoc The proxy service will be used for cross-domain requests, if set, else a network error is returned as exception.
     *
     * @sample Ink_Net_Ajax_1.html 
     */
    var Ajax = function(url, options){

        // start of AjaxMock patch - uncomment to enable it
        /*var AM = SAPO.Communication.AjaxMock;
        if (AM && !options.inMock) {
            if (AM.autoRecordThisUrl && AM.autoRecordThisUrl(url)) {
                return new AM.Record(url, options);
            }
            if (AM.mockThisUrl && AM.mockThisUrl(url)) {
                return new AM.Play(url, options, true);
            }
        }*/
        // end of AjaxMock patch

        this.init(url, options);
    };

    /**
    * Options for all requests. These can then be overriden for individual ones.
    */
    Ajax.globalOptions = {
        parameters: {},
        requestHeaders: {}
    };


    // IE10 does not need XDomainRequest
    var xMLHttpRequestWithCredentials = 'XMLHttpRequest' in window && 'withCredentials' in (new XMLHttpRequest());



    Ajax.prototype = {

        init: function(url, userOptions) {
            if (!url) {
                throw new Error("WRONG_ARGUMENTS_ERR");
            }
            var options = Ink.extendObj({
                asynchronous: true,
                method: 'POST',
                parameters: null,
                timeout: 0,
                delay: 0,
                postBody: '',
                contentType:  'application/x-www-form-urlencoded',
                requestHeaders: null,
                onComplete: null,
                onSuccess: null,
                onFailure: null,
                onException: null,
                onHeaders: null,
                onCreate: null,
                onInit: null,
                onTimeout: null,
                sanitizeJSON: false,
                evalJS: true,
                xhrProxy: '',
                cors: false,
                debug: false,
                useCredentials: false,
                signRequest: false
            }, Ajax.globalOptions);

            if (userOptions && typeof userOptions === 'object') {
                options = Ink.extendObj(options, userOptions);


                if (typeof userOptions.parameters === 'object') {
                    options.parameters = Ink.extendObj(Ink.extendObj({}, Ajax.globalOptions.parameters), userOptions.parameters);
                } else if (userOptions.parameters !== null) {
                    var globalParameters = this.paramsObjToStr(Ajax.globalOptions.parameters);
                    if (globalParameters) {
                        options.parameters = userOptions.parameters + '&' + globalParameters;
                    }
                }

                options.requestHeaders = Ink.extendObj({}, Ajax.globalOptions.requestHeaders);
                options.requestHeaders = Ink.extendObj(options.requestHeaders, userOptions.requestHeaders);
            }

            this.options = options;

            this.safeCall('onInit');

            this.url = url;

            var urlLocation = this._locationFromURL(url);
            this.isHTTP = this._locationIsHTTP(urlLocation);
            this.isCrossDomain = this._locationIsCrossDomain(urlLocation, location);

            this.requestHasBody = options.method.search(/^get|head$/i) < 0;

            if(this.options.cors) {
                this.isCrossDomain = false;
            }

            this.transport = this.getTransport();

            this.request();
        },

        /**
         * Returns a location object from an URL
         *
         * @method _locationFromUrl
         * @param url
         * @private
         **/
        _locationFromURL: function (url) {
            var urlLocation =  document.createElementNS ?
                document.createElementNS('http://www.w3.org/1999/xhtml', 'a') :
                document.createElement('a');
            urlLocation.href = url;
            return urlLocation;
        },

        /**
         * Checks whether a location is HTTP or HTTPS
         *
         * @method locationIsHttp
         * @param urlLocation
         * @private
         */
        _locationIsHTTP: function (urlLocation) {
            return urlLocation.protocol.match(/^https?:/i) ? true : false;
        },

        /**
         * Checks whether a location is cross-domain from another
         *
         * @method _locationIsCrossDomain
         * @param urlLocation {Location}
         * @param otherLocation {Location}
         */
        _locationIsCrossDomain: function (urlLocation, location) {
            location = location || window.location;
            if (!Ajax.prototype._locationIsHTTP(urlLocation) || location.protocol === 'widget:' || typeof window.widget === 'object') {
                return false;
            } else {
                return location.protocol           !== urlLocation.protocol ||
                       location.host.split(':')[0] !== urlLocation.host.split(':')[0];
            }
        },

        /**
         * Creates the appropriate XMLHttpRequest object
         *
         * @method getTransport
         * @return {Object} XMLHttpRequest object
         */
        getTransport: function()
        {
            /*global XDomainRequest:false, ActiveXObject:false */
            if (!xMLHttpRequestWithCredentials && this.options.cors && 'XDomainRequest' in window) {
                this.usingXDomainReq = true;
                return new XDomainRequest();
            }
            else if (typeof XMLHttpRequest !== 'undefined') {
                return new XMLHttpRequest();
            }
            else if (typeof ActiveXObject !== 'undefined') {
                try {
                    return new ActiveXObject('Msxml2.XMLHTTP');
                } catch (e) {
                    return new ActiveXObject('Microsoft.XMLHTTP');
                }
            } else {
                return null;
            }
        },

        /**
         * Set the necessary headers for an ajax request
         *
         * @method setHeaders
         * @param {String} url The url for the request
         */
        setHeaders: function()
        {
            if (this.transport) {
                try {
                    var headers = {
                        "Accept": "text/javascript,text/xml,application/xml,application/xhtml+xml,text/html,application/json;q=0.9,text/plain;q=0.8,video/x-mng,image/png,image/jpeg,image/gif;q=0.2,*/*;q=0.1",
                        "Accept-Language": navigator.language,
                        "X-Requested-With": "XMLHttpRequest",
                        "X-Ink-Version": "2"
                    };
                    if (this.options.cors) {
                        if (!this.options.signRequest) {
                            delete headers['X-Requested-With'];
                        }
                        delete headers['X-Ink-Version'];
                    }

                    if (this.options.requestHeaders && typeof this.options.requestHeaders === 'object') {
                        for(var headerReqName in this.options.requestHeaders) {
                            if (this.options.requestHeaders.hasOwnProperty(headerReqName)) {
                                headers[headerReqName] = this.options.requestHeaders[headerReqName];
                            }
                        }
                    }

                    if (this.transport.overrideMimeType && (navigator.userAgent.match(/Gecko\/(\d{4})/) || [0,2005])[1] < 2005) {
                        headers.Connection = 'close';
                    }

                    for (var headerName in headers) {
                        if(headers.hasOwnProperty(headerName)) {
                            this.transport.setRequestHeader(headerName, headers[headerName]);
                        }
                    }
                } catch(e) {}
            }
        },

        /**
         * Converts an object with parameters to a querystring
         *
         * @method paramsObjToStr
         * @param {Object|String}  optParams  parameters object
         * @return {String} querystring
         */
        paramsObjToStr: function(optParams) {
            var k, m, p, a, params = [];
            if (typeof optParams === 'object') {
                for (p in optParams){
                    if (optParams.hasOwnProperty(p)) {
                        a = optParams[p];
                        if (Object.prototype.toString.call(a) === '[object Array]' && !isNaN(a.length)) {
                            for (k = 0, m = a.length; k < m; k++) {
                                params = params.concat([
                                    encodeURIComponent(p), '[]',   '=',
                                    encodeURIComponent(a[k]), '&'
                                ]);
                            }
                        }
                        else {
                            params = params.concat([
                                encodeURIComponent(p), '=',
                                encodeURIComponent(a), '&'
                            ]);
                        }
                    }
                }
                if (params.length > 0) {
                    params.pop();
                }
            }
            else
            {
                return optParams;
            }
            return params.join('');
        },

        /**
         * Set the url parameters for a GET request
         *
         * @method setParams
         */
        setParams: function()
        {
            var params = null, optParams = this.options.parameters;

            if(typeof optParams === "object"){
                params = this.paramsObjToStr(optParams);
            } else {
                params = '' + optParams;
            }

            if(params){
                if(this.url.indexOf('?') > -1) {
                    this.url = this.url.split('#')[0] + '&' + params;
                } else {
                    this.url = this.url.split('#')[0] + '?' + params;
                }
            }
        },

        /**
         * Gets an HTTP header from the response
         *
         * @method getHeader
         * @param {String}  name    Header name
         * @return {String} header  Content
         */
        getHeader: function(name)
        {
            if (this.usingXDomainReq && name === 'Content-Type') {
                return this.transport.contentType;
            }
            try{
                return this.transport.getResponseHeader(name);
            } catch(e) {
                return null;
            }
        },

        /**
         * Gets all the HTTP headers from the response
         *
         * @method getAllHeaders
         * @return {String} The headers, each separated by a newline
         */
        getAllHeaders: function()
        {
            try {
                return this.transport.getAllResponseHeaders();
            } catch(e) {
                return null;
            }
        },

        /**
         * Sets the response object
         *
         * @method getResponse
         * @return {Object} the response object
         */
        getResponse: function(){
            // setup our own stuff
            var t = this.transport,
                r = {
                    headerJSON: null,
                    responseJSON: null,
                    getHeader: this.getHeader,
                    getAllHeaders: this.getAllHeaders,
                    request: this,
                    transport: t,
                    timeTaken: new Date() - this.startTime,
                    requestedUrl: this.url
                };

            // setup things expected from the native object
            r.readyState = t.readyState;
            try { r.responseText = t.responseText; } catch(e) {}
            try { r.responseXML  = t.responseXML;  } catch(e) {}
            try { r.status       = t.status;       } catch(e) { r.status     = 0;  }
            try { r.statusText   = t.statusText;   } catch(e) { r.statusText = ''; }

            return r;
        },

        /**
         * Aborts the request if still running. No callbacks are called
         *
         * @method abort
         */
        abort: function(){
            if (this.transport) {
                clearTimeout(this.delayTimeout);
                clearTimeout(this.stoTimeout);
                try { this.transport.abort(); } catch(ex) {}
                this.finish();
            }
        },

        /**
         * Executes the state changing phase of an ajax request
         *
         * @method runStateChange
         */
        runStateChange: function()
        {
            var rs = this.transport.readyState;
            if (rs === 3) {
                if (this.isHTTP) {
                    this.safeCall('onHeaders');
                }
            } else if (rs === 4 || this.usingXDomainReq) {

                if (this.options.asynchronous && this.options.delay && (this.startTime + this.options.delay > new Date().getTime())) {
                    this.delayTimeout = setTimeout(Ink.bind(this.runStateChange, this), this.options.delay + this.startTime - new Date().getTime());
                    return;
                }

                var responseJSON,
                    responseContent = this.transport.responseText,
                    response = this.getResponse(),
                    curStatus = this.transport.status;

                if (this.isHTTP && !this.options.asynchronous) {
                    this.safeCall('onHeaders');
                }

                clearTimeout(this.stoTimeout);

                if (curStatus === 0) {
                    // Status 0 indicates network error for http requests.
                    // For http less requests, 0 is always returned.
                    if (this.isHTTP) {
                        this.safeCall('onException', this.makeError(18, 'NETWORK_ERR'));
                    } else {
                        curStatus = responseContent ? 200 : 404;
                    }
                }
                else if (curStatus === 304) {
                    curStatus = 200;
                }
                var isSuccess = this.usingXDomainReq || 200 <= curStatus && curStatus < 300;

                var headerContentType = this.getHeader('Content-Type') || '';
                if (this.options.evalJS &&
                    (headerContentType.indexOf("application/json") >= 0 || this.options.evalJS === 'force')){
                        try {
                            responseJSON = this.evalJSON(responseContent, this.sanitizeJSON);
                            if(responseJSON){
                                responseContent = response.responseJSON = responseJSON;
                            }
                        } catch(e){
                            if (isSuccess) {
                                // If the request failed, then this is perhaps an error page
                                // so don't notify error.
                                this.safeCall('onException', e);
                            }
                        }
                }

                if (this.usingXDomainReq && headerContentType.indexOf('xml') !== -1 && 'DOMParser' in window) {
                    // http://msdn.microsoft.com/en-us/library/ie/ff975278(v=vs.85).aspx
                    var mimeType;
                    switch (headerContentType) {
                        case 'application/xml':
                        case 'application/xhtml+xml':
                        case 'image/svg+xml':
                            mimeType = headerContentType;
                            break;
                        default:
                            mimeType = 'text/xml';
                    }
                    var xmlDoc = (new DOMParser()).parseFromString( this.transport.responseText, mimeType);
                    this.transport.responseXML = xmlDoc;
                    response.responseXML  = xmlDoc;
                }

                if (this.transport.responseXML !== null && response.responseJSON === null && this.transport.responseXML.xml !== ""){
                    responseContent = this.transport.responseXML;
                }

                if (curStatus || this.usingXDomainReq) {
                    if (isSuccess) {
                        this.safeCall('onSuccess', response, responseContent);
                    } else {
                        this.safeCall('onFailure', response, responseContent);
                    }
                    this.safeCall('on'+curStatus, response, responseContent);
                }
                this.finish(response, responseContent);
            }
        },

        /**
         * Last step after XHR is complete. Call onComplete and cleanup object
         *
         * @method finish
         * @param {Any} response
         * @param {Any} responseContent
         */
        finish: function(response, responseContent){
            if (response) {
                this.safeCall('onComplete', response, responseContent);
            }
            clearTimeout(this.stoTimeout);

            if (this.transport) {
                // IE6 sometimes barfs on this one
                try{ this.transport.onreadystatechange = null; } catch(e){}

                if (typeof this.transport.destroy === 'function') {
                    // Stuff for Samsung.
                    this.transport.destroy();
                }

                // Let XHR be collected.
                this.transport = null;
            }
        },

        /**
         * Safely calls a callback function.
         * Verifies that the callback is well defined and traps errors
         *
         * @method safeCall
         * @param {Function}  listener
         */
        safeCall: function(listener, first/*, second*/) {
            function rethrow(exception){
                setTimeout(function() {
                    // Rethrow exception so it'll land in
                    // the error console, firebug, whatever.
                    if (exception.message) {
                        exception.message += '\n'+(exception.stacktrace || exception.stack || '');
                    }
                    throw exception;
                }, 1);
            }
            if (typeof this.options[listener] === 'function') {
                //SAPO.safeCall(this, this.options[listener], first, second);
                //return object[listener].apply(object, [].slice.call(arguments, 2));
                try {
                    this.options[listener].apply(this, [].slice.call(arguments, 1));
                } catch(ex) {
                    rethrow(ex);
                }
            } else if (first && window.Error && (first instanceof Error)) {
                rethrow(first);
            }
        },

        /**
         * Sets a new request header for the next http request
         *
         * @method setRequestHeader
         * @param {String} name
         * @param {String} value
         */
        setRequestHeader: function(name, value){
            if (!this.options.requestHeaders) {
                this.options.requestHeaders = {};
            }
            this.options.requestHeaders[name] = value;
        },

        /**
         * Executes the request
         *
         * @method request
         */
        request: function()
        {
            if(this.transport) {
                var params = null;
                if(this.requestHasBody) {
                    if(this.options.postBody !== null && this.options.postBody !== '') {
                        params = this.options.postBody;
                        this.setParams();
                    } else if (this.options.parameters !== null && this.options.parameters !== ''){
                        params = this.options.parameters;
                    }

                    if (typeof params === "object" && !params.nodeType) {
                        params = this.paramsObjToStr(params);
                    } else if (typeof params !== "object" && params !== null){
                        params = '' + params;
                    }

                    if(this.options.contentType) {
                        this.setRequestHeader('Content-Type', this.options.contentType);
                    }
                } else {
                    this.setParams();
                }

                var url = this.url;
                var method = this.options.method;
                var crossDomain = this.isCrossDomain;

                if (crossDomain && this.options.xhrProxy) {
                    this.setRequestHeader('X-Url', url);
                    url = this.options.xhrProxy + encodeURIComponent(url);
                    crossDomain = false;
                }

                try {
                    this.transport.open(method, url, this.options.asynchronous);
                } catch(e) {
                    this.safeCall('onException', e);
                    return this.finish(this.getResponse(), null);
                }

                this.setHeaders();

                this.safeCall('onCreate');

                if(this.options.timeout && !isNaN(this.options.timeout)) {
                    this.stoTimeout = setTimeout(Ink.bind(function() {
                        if(this.options.onTimeout) {
                            this.safeCall('onTimeout');
                            this.abort();
                        }
                    }, this), (this.options.timeout * 1000));
                }

                if(this.options.useCredentials && !this.usingXDomainReq) {
                    this.transport.withCredentials = true;
                }

                if(this.options.asynchronous && !this.usingXDomainReq) {
                    this.transport.onreadystatechange = Ink.bind(this.runStateChange, this);
                }
                else if (this.usingXDomainReq) {
                    this.transport.onload = Ink.bind(this.runStateChange, this);
                }

                try {
                    if (crossDomain) {
                        // Need explicit handling because Mozila aborts
                        // the script and Chrome fails silently.per the spec
                        throw this.makeError(18, 'NETWORK_ERR');
                    } else {
                        this.startTime = new Date().getTime();
                        this.transport.send(params);
                    }
                } catch(e) {
                    this.safeCall('onException', e);
                    return this.finish(this.getResponse(), null);
                }

                if(!this.options.asynchronous) {
                    this.runStateChange();
                }
            }
        },

        /**
         * Returns a new exception object that can be thrown
         *
         * @method makeError
         * @param code      Error Code
         * @param message   Message
         * @returns {Object}
         */
        makeError: function(code, message){
            if (typeof Error !== 'function') {
                return {code: code, message: message};
            }
            var e = new Error(message);
            e.code = code;
            return e;
        },

        /**
         * Checks if a given string is valid JSON
         *
         * @method isJSON
         * @param {String} str  String to be evaluated
         * @return {Boolean}    True if the string is valid JSON
         */
        isJSON: function(str)
        {
            if (typeof str !== "string" || !str){ return false; }
            str = str.replace(/\\./g, '@').replace(/"[^"\\\n\r]*"/g, '');
            return (/^[,:{}\[\]0-9.\-+Eaeflnr-u \n\r\t]*$/).test(str);
        },

        /**
         * Evaluates a given string as JSON
         *
         * @method evalJSON
         * @param {String}  str         String to be evaluated
         * @param {Boolean} sanitize    Flag to sanitize the content
         * @return {Object}             JSON content as an object
         */
        evalJSON: function(strJSON, sanitize)
        {
            if (strJSON && (!sanitize || this.isJSON(strJSON))) {
                try {
                    if (typeof JSON  !== "undefined" && typeof JSON.parse !== 'undefined'){
                        return JSON.parse(strJSON);
                    }
                    /*jshint evil:true */
                    return eval('(' + strJSON + ')');
                } catch(e) {
                    throw new Error('ERROR: Bad JSON string...');
                }
            }
            return null;
        }
    };

    /**
     * Loads content from a given url through an XMLHttpRequest.
     *
     * Shortcut function for simple AJAX use cases. Works with JSON, XML and plain text.
     *
     * @method load
     * @param {String}   url        Request URL
     * @param {Function} callback   Callback to be executed if the request is successful
     * @return {Object}             XMLHttpRequest object
     *
     * @sample Ink_Net_Ajax_load.html 
     */
    Ajax.load = function(url, callback){
        return new Ajax(url, {
            method: 'GET',
            onSuccess: function(response){
                callback(response.responseJSON || response.responseText, response);
            }
        });
    };

    /**
     * Loads content from a given url through an XMLHttpRequest.
     * Shortcut function for simple AJAX use cases.
     *
     * @method ping
     * @param {String}   url        Request url
     * @param {Function} callback   Callback to be executed if the request is successful
     * @return {Object}             XMLHttpRequest object
     */
    Ajax.ping = function(url, callback){
        return new Ajax(url, {
            method: 'HEAD',
            onSuccess: function(response){
                if (typeof callback === 'function'){
                    callback(response);
                }
            }
        });
    };


    return Ajax;
});

/**
 * Cross Browser JsonP requests
 * @module Ink.Net.JsonP_1
 * @version 1
 */

Ink.createModule('Ink.Net.JsonP', '1', [], function() {

    'use strict';

    /**
     * Executes a JSONP request
     *
     * @class Ink.Net.JsonP
     * @constructor
     *
     * @param {String}      uri                         Request URL
     * @param {Object}      options                     Request options
     * @param {Function}    options.onSuccess           Success callback
     * @param {Function}    [options.onFailure]         Failure callback
     * @param {Object}      [options.failureObj]        Object to be passed as argument to failure callback
     * @param {Number}      [options.timeout]           Timeout for request fail, in seconds. defaults to 10
     * @param {Object}      [options.params]            Object with the parameters and respective values to unfold
     * @param {String}      [options.callbackParam]     Parameter to use as callback. defaults to 'jsoncallback'
     * @param {String}      [options.internalCallback]  Name of the callback function stored in the Ink.Net.JsonP object.
     * @param {String}      [options.randVar]           (Advanced, not recommended unless you know what you're doing) A string to append to the callback name. By default, generate a random number. Use an empty string if you already passed the correct name in the internalCallback option.
     *
     * @sample Ink_Net_JsonP_1.html 
     */
    var JsonP = function(uri, options) {
        this.init(uri, options);
    };

    JsonP.prototype = {

        init: function(uri, options) {
            this.options = Ink.extendObj( {
                onSuccess:         undefined,
                onFailure:          undefined,
                failureObj:         {},
                timeout:            10,
                params:             {},
                callbackParam:      'jsoncallback',
                internalCallback:   '_cb',
                randVar:            false
            }, options || {});

            if(this.options.randVar !== false) {
                this.randVar = this.options.randVar;
            } else {
                this.randVar = parseInt(Math.random() * 100000, 10);
            }

            this.options.internalCallback += this.randVar;

            this.uri = uri;

            // prevent SAPO legacy onComplete - make it onSuccess
            if(typeof(this.options.onComplete) === 'function') {
                this.options.onSuccess = this.options.onComplete;
            }

            if (typeof this.uri !== 'string') {
                throw 'Please define an URI';
            }

            if (typeof this.options.onSuccess !== 'function') {
                throw 'please define a callback function on option onSuccess!';
            }

            Ink.Net.JsonP[this.options.internalCallback] = Ink.bind(function() {
                window.clearTimeout(this.timeout);
                delete window.Ink.Net.JsonP[this.options.internalCallback];
                this._removeScriptTag();
                this.options.onSuccess(arguments[0]);
            }, this);

            this._addScriptTag();
        },

        _addParamsToGet: function(uri, params) {
            var hasQuestionMark = uri.indexOf('?') !== -1;
            var sep, pKey, pValue, parts = [uri];

            for (pKey in params) {
                if (params.hasOwnProperty(pKey)) {
                    if (!hasQuestionMark) { sep = '?';  hasQuestionMark = true; }
                    else {                  sep = '&';                          }
                    pValue = params[pKey];
                    if (typeof pValue !== 'number' && !pValue) {    pValue = '';    }
                    parts = parts.concat([sep, pKey, '=', encodeURIComponent(pValue)]);
                }
            }

            return parts.join('');
        },

        _getScriptContainer: function() {
            var headEls = document.getElementsByTagName('head');
            if (headEls.length === 0) {
                var scriptEls = document.getElementsByTagName('script');
                return scriptEls[0];
            }
            return headEls[0];
        },

        _addScriptTag: function() {
            // enrich options will callback and random seed
            this.options.params[this.options.callbackParam] = 'Ink.Net.JsonP.' + this.options.internalCallback;
            this.options.params.rnd_seed = this.randVar;
            this.uri = this._addParamsToGet(this.uri, this.options.params);
            // create script tag
            var scriptEl = document.createElement('script');
            scriptEl.type = 'text/javascript';
            scriptEl.src = this.uri;
            var scriptCtn = this._getScriptContainer();
            scriptCtn.appendChild(scriptEl);
            this.timeout = setTimeout(Ink.bind(this._requestFailed, this), (this.options.timeout * 1000));
        },

        _requestFailed : function () {
            delete Ink.Net.JsonP[this.options.internalCallback];
            this._removeScriptTag();
            if(typeof this.options.onFailure === 'function'){
                this.options.onFailure(this.options.failureObj);
            }
        },

        _removeScriptTag: function() {
            var scriptEl;
            var scriptEls = document.getElementsByTagName('script');
            var scriptUri;
            for (var i = 0, f = scriptEls.length; i < f; ++i) {
                scriptEl = scriptEls[i];
                scriptUri = scriptEl.getAttribute('src') || scriptEl.src;
                if (scriptUri !== null && scriptUri === this.uri) {
                    scriptEl.parentNode.removeChild(scriptEl);
                    return;
                }
            }
        }

    };

    return JsonP;

});

/**
 * Browser Detection and User Agent sniffing
 * @module Ink.Dom.Browser_1
 * @version 1
 */
Ink.createModule('Ink.Dom.Browser', '1', [], function() {
    'use strict';    

    /**
     * @namespace Ink.Dom.Browser
     * @version 1
     * @static
     * @example
     *     <script>
     *         Ink.requireModules(['Ink.Dom.Browser_1'],function( InkBrowser ){
     *             if( InkBrowser.CHROME ){
     *                 console.log( 'This is a CHROME browser.' );
     *             }
     *         });
     *     </script>
     */
    var Browser = {
        /**
         * True if the browser is Internet Explorer
         *
         * @property IE
         * @type {Boolean}
         * @public
         * @static
         */
        IE: false,

        /**
         * True if the browser is Gecko based
         *
         * @property GECKO
         * @type {Boolean}
         * @public
         * @static
         */
        GECKO: false,

        /**
         * True if the browser is Opera
         *
         * @property OPERA
         * @type {Boolean}
         * @public
         * @static
         */
        OPERA: false,

        /**
         * True if the browser is Safari
         *
         * @property SAFARI
         * @type {Boolean}
         * @public
         * @static
         */
        SAFARI: false,

        /**
         * True if the browser is Konqueror
         *
         * @property KONQUEROR
         * @type {Boolean}
         * @public
         * @static
         */
        KONQUEROR: false,

        /**
         * True if browser is Chrome
         *
         * @property CHROME
         * @type {Boolean}
         * @public
         * @static
         */
        CHROME: false,

        /**
         * The specific browser model.
         * False if it is unavailable.
         *
         * @property model
         * @type {Boolean|String}
         * @public
         * @static
         */
        model: false,

        /**
         * The browser version.
         * False if it is unavailable.
         *
         * @property version
         * @type {Boolean|String}
         * @public
         * @static
         */
        version: false,

        /**
         * The user agent string.
         * False if it is unavailable.
         *
         * @property userAgent
         * @type {Boolean|String}
         * @public
         * @static
         */
        userAgent: false,

        /**
         * The CSS prefix (-moz-, -webkit-, -ms-, ...)
         * False if it is unavailable 
         *
         * @property cssPrefix 
         * @type {Boolean|String}
         * @public 
         * @static 
         */
        cssPrefix: false, 

        /**
         * The DOM prefix (Moz, Webkit, ms, ...)
         * False if it is unavailable 
         * @property domPrefix 
         * @type {Boolean|String}
         * @public 
         * @static 
         */
        domPrefix: false,

        /**
         * Initialization function for the Browser object.
         *
         * Is called automatically when this module is loaded, and calls setDimensions, setBrowser and setReferrer.
         *
         * @method init
         * @public
         */
        init: function() {
            this.detectBrowser();
            this.setDimensions();
            this.setReferrer();
        },

        /**
         * Retrieves and stores window dimensions in this object. Called automatically when this module is loaded.
         *
         * @method setDimensions
         * @public
         */
        setDimensions: function() {
            //this.windowWidth=window.innerWidth !== null? window.innerWidth : document.documentElement && document.documentElement.clientWidth ? document.documentElement.clientWidth : document.body !== null ? document.body.clientWidth : null;
            //this.windowHeight=window.innerHeight != null? window.innerHeight : document.documentElement && document.documentElement.clientHeight ? document.documentElement.clientHeight : document.body != null? document.body.clientHeight : null;
            var myWidth = 0, myHeight = 0;
            if ( typeof window.innerWidth=== 'number' ) {
                myWidth = window.innerWidth;
                myHeight = window.innerHeight;
            } else if( document.documentElement && ( document.documentElement.clientWidth || document.documentElement.clientHeight ) ) {
                myWidth = document.documentElement.clientWidth;
                myHeight = document.documentElement.clientHeight;
            } else if( document.body && ( document.body.clientWidth || document.body.clientHeight ) ) {
                myWidth = document.body.clientWidth;
                myHeight = document.body.clientHeight;
            }
            this.windowWidth = myWidth;
            this.windowHeight = myHeight;
        },

        /**
         * Stores the referrer. Called automatically when this module is loaded.
         *
         * @method setReferrer
         * @public
         */
        setReferrer: function() {
            if (document.referrer && document.referrer.length) {
                this.referrer = window.escape(document.referrer);
            } else {
                this.referrer = false;
            }
        },

        /**
         * Detects the browser and stores the found properties. Called automatically when this module is loaded.
         *
         * @method detectBrowser
         * @public
         */
        detectBrowser: function() {
            this._sniffUserAgent(navigator.userAgent);
        },

        _sniffUserAgent: function (sAgent) {
            this.userAgent = sAgent;

            sAgent = sAgent.toLowerCase();

            if (/applewebkit\//.test(sAgent)) {
                this.cssPrefix = '-webkit-';
                this.domPrefix = 'Webkit';
                if(/(chrome|crios)\//.test(sAgent)) {
                    // Chrome
                    this.CHROME = true;
                    this.model = 'chrome';
                    this.version = sAgent.replace(/(.*)chrome\/([^\s]+)(.*)/, "$2");
                } else {
                    // Safari
                    this.SAFARI = true;
                    this.model = 'safari';
                    var rVersion = /version\/([^) ]+)/;
                    if (rVersion.test(sAgent)) {
                        this.version = sAgent.match(rVersion)[1];
                    } else {
                        this.version = sAgent.replace(/(.*)applewebkit\/([^\s]+)(.*)/, "$2");
                    }
                }
            } else if (/opera/.test(sAgent)) {
                // Opera
                this.OPERA = true;
                this.model = 'opera';
                this.version = sAgent.replace(/(.*)opera.([^\s$]+)(.*)/, "$2");
                this.cssPrefix = '-o-';
                this.domPrefix = 'O';
            } else if (/konqueror/.test(sAgent)) {
                // Konqueroh
                this.KONQUEROR = true;
                this.model = 'konqueror';
                this.version = sAgent.replace(/(.*)konqueror\/([^;]+);(.*)/, "$2");
                this.cssPrefix = '-khtml-';
                this.domPrefix = 'Khtml';
            } else if (/(msie|trident)/i.test(sAgent)) {
                // MSIE
                this.IE = true;
                this.model = 'ie';
                if (/rv:((?:\d|\.)+)/.test(sAgent)) {  // IE 11
                    this.version = sAgent.match(/rv:((?:\d|\.)+)/)[1];
                } else {
                    this.version = sAgent.replace(/(.*)\smsie\s([^;]+);(.*)/, "$2");
                }
                this.cssPrefix = '-ms-';
                this.domPrefix = 'ms';
            } else if (/gecko/.test(sAgent)) {
                // GECKO
                // Supports only:
                // Camino, Chimera, Epiphany, Minefield (firefox 3), Firefox, Firebird, Phoenix, Galeon,
                // Iceweasel, K-Meleon, SeaMonkey, Netscape, Songbird, Sylera,
                this.cssPrefix = '-moz-';
                this.domPrefix = 'Moz';

                this.GECKO = true;

                var re = /(camino|chimera|epiphany|minefield|firefox|firebird|phoenix|galeon|iceweasel|k\-meleon|seamonkey|netscape|songbird|sylera)/;
                if(re.test(sAgent)) {
                    this.model = sAgent.match(re)[1];
                    this.version = sAgent.replace(new RegExp("(.*)"+this.model+"\/([^;\\s$]+)(.*)"), "$2");
                } else {
                    // probably is mozilla
                    this.model = 'mozilla';
                    var reVersion = /(.*)rv:([^)]+)(.*)/;
                    if(reVersion.test(sAgent)) {
                        this.version = sAgent.replace(reVersion, "$2");
                    }
                }
            }
        },

        /**
         * Debug function which displays browser (and Ink.Dom.Browser) information as an alert message.
         *
         * @method debug
         * @public
         * @sample Ink_Dom_Browser_1_debug.html
         */
        debug: function() {
            /*global alert:false */
            var str = "known browsers: (ie, gecko, opera, safari, konqueror) \n";
                str += [this.IE, this.GECKO, this.OPERA, this.SAFARI, this.KONQUEROR] +"\n";
                str += "cssPrefix -> "+this.cssPrefix+"\n";
                str += "domPrefix -> "+this.domPrefix+"\n";
                str += "model -> "+this.model+"\n";
                str += "version -> "+this.version+"\n";
                str += "\n";
                str += "original UA -> "+this.userAgent;

            alert(str);
        }
    };

    Browser.init();

    return Browser;
});

/**
 * CSS Utilities and toolbox
 * @module Ink.Dom.Css_1
 * @version 1
 */

Ink.createModule( 'Ink.Dom.Css', 1, [], function() {

    'use strict';

     // getComputedStyle feature detection.
     var getCs = ("defaultView" in document) && ("getComputedStyle" in document.defaultView) ? document.defaultView.getComputedStyle : window.getComputedStyle;

    /**
     * @namespace Ink.Dom.Css
     * @static
     */

    var Css = {
        /**
         * Adds of removes a class.
         * Depending on addRemState, this method either adds a class if it's true or removes if if false.
         *
         * @method addRemoveClassName
         * @param {DOMElement|string}   elm          DOM element or element id
         * @param {string}              className    class name to add or remove.
         * @param {boolean}             addRemState  Whether to add or remove. `true` to add, `false` to remove.
         * @sample Ink_Dom_Css_addRemoveClassName.html 
         */
        addRemoveClassName: function(elm, className, addRemState) {
            if (addRemState) {
                return this.addClassName(elm, className);
            }
            this.removeClassName(elm, className);
        },

        /**
         * Adds a class to a given element
         *
         * @method addClassName
         * @param {DOMElement|String}   elm          DOM element or element id
         * @param {String|Array}        className    Classes 
         * @sample Ink_Dom_Css_addClassName.html
         */
        addClassName: function(elm, className) {
            elm = Ink.i(elm);
            if (!elm || !className) { return null; }
            className = ('' + className).split(/[, ]+/);
            var i = 0;
            var len = className.length;

            for (; i < len; i++) {
                // remove whitespace and ignore on empty string
                if (className[i].replace(/^\s+|\s+$/g, '')) {
                    if (typeof elm.classList !== "undefined") {
                        elm.classList.add(className[i]);
                    } else if (!Css.hasClassName(elm, className[i])) {
                        elm.className += (elm.className ? ' ' : '') + className[i];
                    }
                }
            }
        },

        /**
         * Removes a class from a given element
         *
         * @method removeClassName
         * @param {DOMElement|String}   elm        DOM element or element id
         * @param {String|Array}        className  Class names to remove. You can either use a space separated string of classnames, comma-separated list or an array
         * @sample Ink_Dom_Css_removeClassName.html 
         */
        removeClassName: function(elm, className) {
            elm = Ink.i(elm);
            if (!elm || !className) { return null; }
            
            className = ('' + className).split(/[, ]+/);
            var i = 0;
            var len = className.length;

            if (typeof elm.classList !== "undefined"){
                for (; i < len; i++) {
                    elm.classList.remove(className[i]);
                }
            } else {
                var elmClassName = elm.className || '';
                var re;
                for (; i < len; i++) {
                    re = new RegExp("(^|\\s+)" + className[i] + "(\\s+|$)");
                    elmClassName = elmClassName.replace(re, ' ');
                }
                elm.className = (elmClassName
                    .replace(/^\s+/, '')
                    .replace(/\s+$/, ''));
            }
        },

        /**
         * Alias to addRemoveClassName. 
         * Utility function, saves many if/elses.
         *
         * @method setClassName
         * @uses addRemoveClassName
         * @param {DOMElement|String}  elm          DOM element or element id
         * @param {String|Array}       className    Class names to add\remove. Comma separated, space separated or simply an Array
         * @param {Boolean}            [add]=false  Flag to switch behavior from removal to addition. true to add, false to remove
         */
        setClassName: function(elm, className, add) {
            this.addRemoveClassName(elm, className, add || false);
        },

        /**
         * Checks if an element has a class.
         * This method verifies if an element has ONE of a list of classes. If the last argument is flagged as true, instead checks if the element has ALL the classes
         * 
         * @method hasClassName
         * @param {DOMElement|String}  elm         DOM element or element id
         * @param {String|Array}       className   Class names to test
         * @param {Boolean}            [all]=false If flagged as true, it will check if the element contains ALL the CSS classes
         * @return {Boolean} true if a given class is applied to a given element
         * @sample Ink_Dom_Css_hasClassName.html 
         */
        hasClassName: function(elm, className, all) {
            elm = Ink.i(elm);
            if (!elm || !className) { return false; }

            className = ('' + className).split(/[, ]+/);
            var i = 0;
            var len = className.length;
            var has;
            var re;

            for ( ; i < len; i++) {
                if (typeof elm.classList !== "undefined"){
                    has = elm.classList.contains(className[i]);
                } else {
                    var elmClassName = elm.className;
                    if (elmClassName === className[i]) {
                        has = true;
                    } else {
                        re = new RegExp("(^|\\s)" + className[i] + "(\\s|$)");
                        has = re.test(elmClassName);
                    }
                }
                if (has && !all) { return true; }  // return if looking for any class
                if (!has && all) { return false; }  // return if looking for all classes
            }

            if (all) {
                // if we got here, all classes were found so far
                return true;
            } else {
                // if we got here with all == false, no class was found
                return false;
            }
        },

        /**
         * Blinks a class from an element
         * Add and removes the class from the element with a timeout, so it blinks
         *
         * @method blinkClass
         * @uses addRemoveClassName
         * @param {DOMElement|String}  elm        DOM element or element id
         * @param {String|Array}       className  Class name(s) to blink
         * @param {Number}            timeout    timeout in ms between adding and removing, default 100 ms
         * @param {Boolean}            negate     is true, class is removed then added
         * @sample Ink_Dom_Css_blinkClass.html 
         */
        blinkClass: function(element, className, timeout, negate){
            element = Ink.i(element);
            Css.addRemoveClassName(element, className, !negate);
            setTimeout(function() {
                Css.addRemoveClassName(element, className, negate);
            }, Number(timeout) || 100);
        },

        /**
         * Toggles a class name from a given element
         *
         * @method toggleClassName
         * @param {DOMElement|String}  elm        DOM element or element id
         * @param {String}             className  Class name
         * @param {Boolean}            [forceAdd] Flag to force adding the the classe names if they don't exist yet.
         * @sample Ink_Dom_Css_toggleClassName.html 
         */
        toggleClassName: function(elm, className, forceAdd) {
            if (elm && className){
                if (typeof elm.classList !== "undefined" && !/[, ]/.test(className)){
                    elm = Ink.i(elm);
                    if (elm !== null){
                        elm.classList.toggle(className);
                    }
                    return true;
                }
            }

            if (typeof forceAdd !== 'undefined') {
                if (forceAdd === true) {
                    Css.addClassName(elm, className);
                }
                else if (forceAdd === false) {
                    Css.removeClassName(elm, className);
                }
            } else {
                if (Css.hasClassName(elm, className)) {
                    Css.removeClassName(elm, className);
                } else {
                    Css.addClassName(elm, className);
                }
            }
        },

        /**
         * Sets the opacity of given element 
         *
         * @method setOpacity
         * @param {DOMElement|String}  elm    DOM element or element id
         * @param {Number}             value  allows 0 to 1(default mode decimal) or percentage (warning using 0 or 1 will reset to default mode)
         * @sample Ink_Dom_Css_setOpacity.html 
         */
        setOpacity: function(elm, value) {
            elm = Ink.i(elm);
            if (elm !== null){
                var val = 1;

                if (!isNaN(Number(value))){
                    if      (value <= 0) {   val = 0;           }
                    else if (value <= 1) {   val = value;       }
                    else if (value <= 100) { val = value / 100; }
                    else {                   val = 1;           }
                }

                if (typeof elm.style.opacity !== 'undefined') {
                    elm.style.opacity = val;
                }
                else {
                    elm.style.filter = "alpha(opacity:"+(val*100|0)+")";
                }
            }
        },

        /**
         * Converts a css property name to a string in camelcase to be used with CSSStyleDeclaration.
         * @method _camelCase
         * @private
         * @param {String} str  String to convert
         * @return {String} Converted string
         */
        _camelCase: function(str) {
            return str ? str.replace(/-(\w)/g, function (_, $1) {
                return $1.toUpperCase();
            }) : str;
        },


        /**
         * Gets the value for an element's style attribute
         *
         * @method getStyle
         * @param {DOMElement|String}  elm    DOM element or element id
         * @param {String}             style  Which css attribute to fetch
         * @return Style value
         * @sample Ink_Dom_Css_getStyle.html 
         */
         getStyle: function(elm, style) {
             elm = Ink.i(elm);
             if (elm !== null && elm.style) {
                 style = style === 'float' ? 'cssFloat': this._camelCase(style);

                 var value = elm.style[style];

                 if (getCs && (!value || value === 'auto')) {
                     var css = getCs(elm, null);
                     value = css ? css[style] : null;
                 }
                 else if (!value && elm.currentStyle) {
                      value = elm.currentStyle[style];
                      if (value === 'auto' && (style === 'width' || style === 'height')) {
                        value = elm["offset" + style.charAt(0).toUpperCase() + style.slice(1)] + "px";
                      }
                 }

                 if (style === 'opacity') {
                     return value ? parseFloat(value, 10) : 1.0;
                 }
                 else if (style === 'borderTopWidth'   || style === 'borderBottomWidth' ||
                          style === 'borderRightWidth' || style === 'borderLeftWidth'       ) {
                      if      (value === 'thin') {      return '1px';   }
                      else if (value === 'medium') {    return '3px';   }
                      else if (value === 'thick') {     return '5px';   }
                 }

                 return value === 'auto' ? null : value;
             }
         },


        /**
         * Adds CSS rules to an element's style attribute.
         *
         * @method setStyle
         * @param {DOMElement|String}  elm    DOM element or element id
         * @param {String}             style  Which css attribute to set
         * @sample Ink_Dom_Css_setStyle.html 
         */
        setStyle: function(elm, style) {
            elm = Ink.i(elm);
            if (elm === null) { return; }
            if (typeof style === 'string') {
                elm.style.cssText += '; '+style;

                if (style.indexOf('opacity') !== -1) {
                    this.setOpacity(elm, style.match(/opacity:\s*(\d?\.?\d*)/)[1]);
                }
            }
            else {
                for (var prop in style) {
                    if (style.hasOwnProperty(prop)){
                        if (prop === 'opacity') {
                            this.setOpacity(elm, style[prop]);
                        }
                        else if (prop === 'float' || prop === 'cssFloat') {
                            if (typeof elm.style.styleFloat === 'undefined') {
                                elm.style.cssFloat = style[prop];
                            }
                            else {
                                elm.style.styleFloat = style[prop];
                            }
                        } else {
                            elm.style[prop] = style[prop];
                        }
                    }
                }
            }
        },


        /**
         * Shows an element.
         * Internally it unsets the display property of an element. You can force a specific display property using forceDisplayProperty
         *
         * @method show
         * @param {DOMElement|String}  elm                      DOM element or element id
         * @param {String}             [forceDisplayProperty]   Css display property to apply on show
         * @sample Ink_Dom_Css_show.html 
         */
        show: function(elm, forceDisplayProperty) {
            elm = Ink.i(elm);
            if (elm !== null) {
                elm.style.display = (forceDisplayProperty) ? forceDisplayProperty : '';
            }
        },

        /**
         * Hides an element.
         *
         * @method hide
         * @param {DOMElement|String}  elm  DOM element or element id
         * @sample Ink_Dom_Css_hide.html 
         */
        hide: function(elm) {
            elm = Ink.i(elm);
            if (elm !== null) {
                elm.style.display = 'none';
            }
        },

        /**
         * Shows or hides an element.
         * If the show parameter is true, it shows the element. Otherwise, hides it.
         *
         * @method showHide
         * @param {DOMElement|String}  elm          DOM element or element id
         * @param {boolean}            [show]=false Whether to show or hide `elm`.
         * @sample Ink_Dom_Css_showHide.html 
         */
        showHide: function(elm, show) {
            elm = Ink.i(elm);
            if (elm) {
                elm.style.display = show ? '' : 'none';
            }
        },

        /**
         * Toggles an element visibility.
         * 
         * @method toggle
         * @param {DOMElement|String}  elm        DOM element or element id
         * @param {Boolean}            forceShow  Forces showing if element is hidden
         * @sample Ink_Dom_Css_toggle.html 
         */
        toggle: function(elm, forceShow) {
            elm = Ink.i(elm);
            if (elm !== null) {
                if (typeof forceShow !== 'undefined') {
                    if (forceShow === true) {
                        this.show(elm);
                    } else {
                        this.hide(elm);
                    }
                } else {
                    if (this.getStyle(elm,'display').toLowerCase() === 'none') {
                        this.show(elm);
                    }
                    else {
                        this.hide(elm);
                    }
                }
            }
        },

        _getRefTag: function(head){
            if (head.firstElementChild) {
                return head.firstElementChild;
            }

            for (var child = head.firstChild; child; child = child.nextSibling){
                if (child.nodeType === 1){
                    return child;
                }
            }
            return null;
        },

        /**
         * Injects style tags with rules to the page.
         *
         * @method appendStyleTag
         * @param {String}  selector  The css selector for the rule
         * @param {String}  style     The content of the style rule
         * @param {Object}  options   Options for the tag
         *    @param {String}  [options.type]='text/css'   File type
         *    @param {Boolean} [options.force]=false  If true, the style tag will be appended to end of head
         * 
         * @sample Ink_Dom_Css_appendStyleTag.html 
         */
        appendStyleTag: function(selector, style, options){
            options = Ink.extendObj({
                type: 'text/css',
                force: false
            }, options || {});

            var styles = document.getElementsByTagName("style"),
                oldStyle = false, setStyle = true, i, l;

            for (i=0, l=styles.length; i<l; i++) {
                oldStyle = styles[i].innerHTML;
                if (oldStyle.indexOf(selector) >= 0) {
                    setStyle = false;
                }
            }

            if (setStyle) {
                var defStyle = document.createElement("style"),
                    head = document.getElementsByTagName("head")[0],
                    refTag = false, styleStr = '';

                defStyle.type  = options.type;

                styleStr += selector +" {";
                styleStr += style;
                styleStr += "} ";

                if (typeof defStyle.styleSheet !== "undefined") {
                    defStyle.styleSheet.cssText = styleStr;
                } else {
                    defStyle.appendChild(document.createTextNode(styleStr));
                }

                if (options.force){
                    head.appendChild(defStyle);
                } else {
                    refTag = this._getRefTag(head);
                    if (refTag){
                        head.insertBefore(defStyle, refTag);
                    }
                }
            }
        },

        /**
         * Injects an external link tag.
         * This method add a stylesheet to the head of a page
         *
         * @method appendStylesheet
         * @param {String}  path     File path
         * @param {Object}  options  Options for the tag
         *    @param {String}   [options.media]='screen'    Media type
         *    @param {String}   [options.type]='text/css'   File type
         *    @param {Boolean}  [options.force]=false       If true, tag will be appended to end of head
         * @sample Ink_Dom_Css_appendStylesheet.html 
         */
        appendStylesheet: function(path, options){
            options = Ink.extendObj({
                media: 'screen',
                type: 'text/css',
                force: false
            }, options || {});

            var refTag,
                style = document.createElement("link"),
                head = document.getElementsByTagName("head")[0];

            style.media = options.media;
            style.type = options.type;
            style.href = path;
            style.rel = "Stylesheet";

            if (options.force){
                head.appendChild(style);
            }
            else {
                refTag = this._getRefTag(head);
                if (refTag){
                    head.insertBefore(style, refTag);
                }
            }
        },

        /**
         * Injects an external link tag.
         * Loads CSS via LINK element inclusion in HEAD (skips append if already there)
         *
         * Works similarly to appendStylesheet but:
         *   supports optional callback which gets invoked once the CSS has been applied
         *
         * @method appendStylesheetCb
         * @param {String}            cssURI      URI of the CSS to load, if empty ignores and just calls back directly
         * @param {Function(cssURI)}  [callback]  optional callback which will be called once the CSS is loaded
         * @sample Ink_Dom_Css_appendStylesheetCb.html 
         */
        _loadingCSSFiles: {},
        _loadedCSSFiles:  {},
        appendStylesheetCb: function(url, callback) {
            if (!url) {
                return callback(url);
            }

            if (this._loadedCSSFiles[url]) {
                return callback(url);
            }

            var cbs = this._loadingCSSFiles[url];
            if (cbs) {
                return cbs.push(callback);
            }

            this._loadingCSSFiles[url] = [callback];

            var linkEl = document.createElement('link');
            linkEl.type = 'text/css';
            linkEl.rel  = 'stylesheet';
            linkEl.href = url;

            var headEl = document.getElementsByTagName('head')[0];
            headEl.appendChild(linkEl);

            var imgEl = document.createElement('img');
            /*
            var _self = this;
            (function(_url) {
                imgEl.onerror = function() {
                    //var url = this;
                    var url = _url;
                    _self._loadedCSSFiles[url] = true;
                    var callbacks = _self._loadingCSSFiles[url];
                    for (var i = 0, f = callbacks.length; i < f; ++i) {
                        callbacks[i](url);
                    }
                    delete _self._loadingCSSFiles[url];
                };
            })(url);
            */
            imgEl.onerror = Ink.bindEvent(function(event, _url) {
                //var url = this;
                var url = _url;
                this._loadedCSSFiles[url] = true;
                var callbacks = this._loadingCSSFiles[url];
                for (var i = 0, f = callbacks.length; i < f; ++i) {
                    callbacks[i](url);
                }
                delete this._loadingCSSFiles[url];
            }, this, url);
            imgEl.src = url;
        },

        /**
         * Converts decimal to hexadecimal values
         * Useful to convert colors to their hexadecimal representation.
         *
         * @method decToHex
         * @param {String} dec Either a single decimal value, an rgb(r, g, b) string or an Object with r, g and b properties
         * @return {String} Hexadecimal value
         * @sample Ink_Dom_Css_decToHex.html 
         */
        decToHex: function(dec) {
            var normalizeTo2 = function(val) {
                if (val.length === 1) {
                    val = '0' + val;
                }
                val = val.toUpperCase();
                return val;
            };

            if (typeof dec === 'object') {
                var rDec = normalizeTo2(parseInt(dec.r, 10).toString(16));
                var gDec = normalizeTo2(parseInt(dec.g, 10).toString(16));
                var bDec = normalizeTo2(parseInt(dec.b, 10).toString(16));
                return rDec+gDec+bDec;
            }
            else {
                dec += '';
                var rgb = dec.match(/\((\d+),\s?(\d+),\s?(\d+)\)/);
                if (rgb !== null) {
                    return  normalizeTo2(parseInt(rgb[1], 10).toString(16)) +
                            normalizeTo2(parseInt(rgb[2], 10).toString(16)) +
                            normalizeTo2(parseInt(rgb[3], 10).toString(16));
                }
                else {
                    return normalizeTo2(parseInt(dec, 10).toString(16));
                }
            }
        },

        /**
         * Converts hexadecimal values to decimal
         * Useful to use with CSS colors
         *
         * @method hexToDec
         * @param {String}  hex  hexadecimal Value with 6, 3, 2 or 1 characters
         * @return {Number} Object with properties r, g, b if length of number is >= 3 or decimal value instead.
         * @sample Ink_Dom_Css_hexToDec.html 
         */
        hexToDec: function(hex){
            if (hex.indexOf('#') === 0) {
                hex = hex.substr(1);
            }
            if (hex.length === 6) { // will return object RGB
                return {
                    r: parseInt(hex.substr(0,2), 16),
                    g: parseInt(hex.substr(2,2), 16),
                    b: parseInt(hex.substr(4,2), 16)
                };
            }
            else if (hex.length === 3) { // will return object RGB
                return {
                    r: parseInt(hex.charAt(0) + hex.charAt(0), 16),
                    g: parseInt(hex.charAt(1) + hex.charAt(1), 16),
                    b: parseInt(hex.charAt(2) + hex.charAt(2), 16)
                };
            }
            else if (hex.length <= 2) { // will return int
                return parseInt(hex, 16);
            }
        },

        /**
         * Get a single property from a stylesheet.
         * Use this to obtain the value of a CSS property (searched from loaded CSS documents)
         *
         * @method getPropertyFromStylesheet
         * @param {String}  selector  a CSS rule. must be an exact match
         * @param {String}  property  a CSS property
         * @return {String} value of the found property, or null if it wasn't matched
         */
        getPropertyFromStylesheet: function(selector, property) {
            var rule = this.getRuleFromStylesheet(selector);
            if (rule) {
                return rule.style[property];
            }
            return null;
        },

        getPropertyFromStylesheet2: function(selector, property) {
            var rules = this.getRulesFromStylesheet(selector);
            /*
            rules.forEach(function(rule) {
                var x = rule.style[property];
                if (x !== null && x !== undefined) {
                    return x;
                }
            });
            */
            var x;
            for(var i=0, t=rules.length; i < t; i++) {
                x = rules[i].style[property];
                if (x !== null && x !== undefined) {
                    return x;
                }
            }
            return null;
        },

        getRuleFromStylesheet: function(selector) {
            var sheet, rules, ri, rf, rule;
            var s = document.styleSheets;
            if (!s) {
                return null;
            }

            for (var si = 0, sf = document.styleSheets.length; si < sf; ++si) {
                sheet = document.styleSheets[si];
                rules = sheet.rules ? sheet.rules : sheet.cssRules;
                if (!rules) { return null; }

                for (ri = 0, rf = rules.length; ri < rf; ++ri) {
                    rule = rules[ri];
                    if (!rule.selectorText) { continue; }
                    if (rule.selectorText === selector) {
                        return rule;
                    }
                }
            }

            return null;
        },

        getRulesFromStylesheet: function(selector) {
            var res = [];
            var sheet, rules, ri, rf, rule;
            var s = document.styleSheets;
            if (!s) { return res; }

            for (var si = 0, sf = document.styleSheets.length; si < sf; ++si) {
                sheet = document.styleSheets[si];
                rules = sheet.rules ? sheet.rules : sheet.cssRules;
                if (!rules) {
                    return null;
                }

                for (ri = 0, rf = rules.length; ri < rf; ++ri) {
                    rule = rules[ri];
                    if (!rule.selectorText) { continue; }
                    if (rule.selectorText === selector) {
                        res.push(rule);
                    }
                }
            }

            return res;
        },

        getPropertiesFromRule: function(selector) {
            var rule = this.getRuleFromStylesheet(selector);
            var props = {};
            var prop, i, f;

            /*if (typeof rule.style.length === 'snumber') {
                for (i = 0, f = rule.style.length; i < f; ++i) {
                    prop = this._camelCase( rule.style[i]   );
                    props[prop] = rule.style[prop];
                }
            }
            else {  // HANDLES IE 8, FIREFOX RULE JOINING... */
                rule = rule.style.cssText;
                var parts = rule.split(';');
                var steps, val, pre, pos;
                for (i = 0, f = parts.length; i < f; ++i) {
                    if (parts[i].charAt(0) === ' ') {
                        parts[i] = parts[i].substring(1);
                    }
                    steps = parts[i].split(':');
                    prop = this._camelCase( steps[0].toLowerCase()  );
                    val = steps[1];
                    if (val) {
                        val = val.substring(1);

                        if (prop === 'padding' || prop === 'margin' || prop === 'borderWidth') {

                            if (prop === 'borderWidth') {   pre = 'border'; pos = 'Width';  }
                            else {                          pre = prop;     pos = '';       }

                            if (val.indexOf(' ') !== -1) {
                                val = val.split(' ');
                                props[pre + 'Top'   + pos]  = val[0];
                                props[pre + 'Bottom'+ pos]  = val[0];
                                props[pre + 'Left'  + pos]  = val[1];
                                props[pre + 'Right' + pos]  = val[1];
                            }
                            else {
                                props[pre + 'Top'   + pos]  = val;
                                props[pre + 'Bottom'+ pos]  = val;
                                props[pre + 'Left'  + pos]  = val;
                                props[pre + 'Right' + pos]  = val;
                            }
                        }
                        else if (prop === 'borderRadius') {
                            if (val.indexOf(' ') !== -1) {
                                val = val.split(' ');
                                props.borderTopLeftRadius       = val[0];
                                props.borderBottomRightRadius   = val[0];
                                props.borderTopRightRadius      = val[1];
                                props.borderBottomLeftRadius    = val[1];
                            }
                            else {
                                props.borderTopLeftRadius       = val;
                                props.borderTopRightRadius      = val;
                                props.borderBottomLeftRadius    = val;
                                props.borderBottomRightRadius   = val;
                            }
                        }
                        else {
                            props[prop] = val;
                        }
                    }
                }
            //}
            //console.log(props);

            return props;
        },

        /**
         * Change the font size of elements.
         * Changes the font size of the elements which match the given CSS rule
         * For this function to work, the CSS file must be in the same domain than the host page, otherwise JS can't access it.
         *
         * @method changeFontSize
         * @param {String}  selector  CSS selector rule
         * @param {Number}  delta     Number of pixels to change on font-size
         * @param {String}  [op]      Supported operations are '+' and '*'. defaults to '+'
         * @param {Number}  [minVal]  If result gets smaller than minVal, change does not occurr
         * @param {Number}  [maxVal]  If result gets bigger  than maxVal, change does not occurr
         */
        changeFontSize: function(selector, delta, op, minVal, maxVal) {
            var that = this;
            Ink.requireModules(['Ink.Dom.Selector_1'], function(Selector) {
                var e;
                if      (typeof selector !== 'string') { e = '1st argument must be a CSS selector rule.'; }
                else if (typeof delta    !== 'number') { e = '2nd argument must be a number.'; }
                else if (op !== undefined && op !== '+' && op !== '*') { e = '3rd argument must be one of "+", "*".'; }
                else if (minVal !== undefined && (typeof minVal !== 'number' || minVal <= 0)) { e = '4th argument must be a positive number.'; }
                else if (maxVal !== undefined && (typeof maxVal !== 'number' || maxVal < maxVal)) { e = '5th argument must be a positive number greater than minValue.'; }
                if (e) { throw new TypeError(e); }

                var val, el, els = Selector.select(selector);
                if (minVal === undefined) { minVal = 1; }
                op = (op === '*') ? function(a,b){return a*b;} : function(a,b){return a+b;};
                for (var i = 0, f = els.length; i < f; ++i) {
                    el = els[i];
                    val = parseFloat( that.getStyle(el, 'fontSize'));
                    val = op(val, delta);
                    if (val < minVal) { continue; }
                    if (typeof maxVal === 'number' && val > maxVal) { continue; }
                    el.style.fontSize = val + 'px';
                }
            });
        }

    };

    return Css;

});

/**
 * DOM Traversal and manipulation
 * @module Ink.Dom.Element_1
 * @version 1
 */

Ink.createModule('Ink.Dom.Element', 1, [], function() {

    'use strict';

    var createContextualFragmentSupport = (
        typeof document.createRange === 'function' &&
        typeof window.Range.prototype.createContextualFragment === 'function');

    var deleteThisTbodyToken = 'Ink.Dom.Element tbody: ' + Math.random();
    var browserCreatesTbodies = (function () {
        var div = document.createElement('div');
        div.innerHTML = '<table>';
        return div.getElementsByTagName('tbody').length !== 0;
    }());

    function rect(elem){
        var dimensions = {};
        try {
            dimensions = elem.getBoundingClientRect();
        } catch(e){
            dimensions = { top: elem.offsetTop, left: elem.offsetLeft };
        }
        return dimensions;
    }

    /**
     * @namespace Ink.Dom.Element_1
     */

    var InkElement = {

        /**
         * Checks if something is a DOM Element.
         *
         * @method isDOMElement
         * @static
         * @param   {Mixed}     o   The object to be checked.
         * @return  {Boolean}       True if it's a valid DOM Element.
         * @example
         *     var el = Ink.s('#element');
         *     if( InkElement.isDOMElement( el ) === true ){
         *         // It is a DOM Element.
         *     } else {
         *         // It is NOT a DOM Element.
         *     }
         */
        isDOMElement: function(o) {
            return o !== null && typeof o === 'object' && 'nodeType' in o && o.nodeType === 1;
        },

        /**
         * Shortcut for `document.getElementById`
         *
         * @method get
         * @param {String|DOMElement} elm   Either an ID of an element, or an element.
         * @return {DOMElement|null} The DOM element with the given id or null when it was not found
         * @sample Ink_Dom_Element_1_get.html
         */
        get: function(elm) {
            if(typeof elm !== 'undefined') {
                if(typeof elm === 'string') {
                    return document.getElementById(elm);
                }
                return elm;
            }
            return null;
        },

        /**
         * Creates a DOM element
         *
         * @method create
         * @param {String} tag        tag name
         * @param {Object} properties  object with properties to be set on the element. You can also call other functions in Ink.Dom.Element like this
         * @sample Ink_Dom_Element_1_create.html
         */
        create: function(tag, properties) {
            var el = document.createElement(tag);
            //Ink.extendObj(el, properties);
            for(var property in properties) {
                if(properties.hasOwnProperty(property)) {
                    if (property in InkElement) {
                        InkElement[property](el, properties[property]);
                    } else {
                        if(property === 'className' || property === 'class') {
                            el.className = properties.className || properties['class'];
                        } else {
                            el.setAttribute(property, properties[property]);
                        }
                    }
                }
            }
            return el;
        },

        /**
         * Removes a DOM Element
         *
         * @method remove
         * @param {DOMElement} elm  The element to remove
         * @sample Ink_Dom_Element_1_remove.html
         */
        remove: function(el) {
            el = Ink.i(el);
            var parEl;
            if (el && (parEl = el.parentNode)) {
                parEl.removeChild(el);
            }
        },

        /**
         * Scrolls the window to an element
         *
         * @method scrollTo
         * @param {DOMElement|String} elm  Element where to scroll
         * @sample Ink_Dom_Element_1_scrollTo.html
         */
        scrollTo: function(elm) {
            elm = InkElement.get(elm);
            if(elm) {
                if (elm.scrollIntoView) {
                    return elm.scrollIntoView();
                }

                var elmOffset = {},
                    elmTop = 0, elmLeft = 0;

                do {
                    elmTop += elm.offsetTop || 0;
                    elmLeft += elm.offsetLeft || 0;

                    elm = elm.offsetParent;
                } while(elm);

                elmOffset = {x: elmLeft, y: elmTop};

                window.scrollTo(elmOffset.x, elmOffset.y);
            }
        },

        /**
         * Gets the top offset of an element
         *
         * @method offsetTop
         * @uses Ink.Dom.Browser
         *
         * @param {DOMElement|String} elm  Target element
         * @return {Number} Offset from the target element to the top of the document
         * @sample Ink_Dom_Element_1_offsetTop.html
         */
        offsetTop: function(elm) {
            return InkElement.offset(elm)[1];
        },

        /**
         * Gets the left offset of an element
         *
         * @method offsetLeft
         * @uses Ink.Dom.Browser
         *
         * @param {DOMElement|String} elm  Target element
         * @return {Number} Offset from the target element to the left of the document
         * @sample Ink_Dom_Element_1_offsetLeft.html
         */
        offsetLeft: function(elm) {
            return InkElement.offset(elm)[0];
        },

        /**
        * Gets the relative offset of an element
        *
        * @method positionedOffset
        * @param {DOMElement|String} elm  Target element
        * @return {Array} Array with the element offsetleft and offsettop relative to the closest positioned ancestor
        * @sample Ink_Dom_Element_1_positionedOffset.html
        */
        positionedOffset: function(element) {
            var valueTop = 0, valueLeft = 0;
            element = InkElement.get(element);
            do {
                valueTop  += element.offsetTop  || 0;
                valueLeft += element.offsetLeft || 0;
                element = element.offsetParent;
                if (element) {
                    if (element.tagName.toLowerCase() === 'body') { break;  }

                    var value = element.style.position;
                    if (!value && element.currentStyle) {
                        value = element.currentStyle.position;
                    }
                    if ((!value || value === 'auto') && typeof getComputedStyle !== 'undefined') {
                        var css = getComputedStyle(element, null);
                        value = css ? css.position : null;
                    }
                    if (value === 'relative' || value === 'absolute') { break;  }
                }
            } while (element);
            return [valueLeft, valueTop];
        },

        /**
         * Gets the cumulative offset for an element
         *
         * Returns the top left position of the element on the page
         *
         * @method offset
         * @uses Ink.Dom.Browser
         *
         * @method offset
         * @param {DOMElement|String}   elm     Target element
         * @return {[Number, Number]}   Array with pixel distance from the target element to the top left corner of the document
         * @sample Ink_Dom_Element_1_offset.html
         */
        offset: function(el) {
            /*jshint boss:true */
            el = Ink.i(el);
            var res = [0, 0];
            var doc = el.ownerDocument,
                docElem = doc.documentElement,
                box = rect(el),
                body = doc.body,
                clientTop  = docElem.clientTop  || body.clientTop  || 0,
                clientLeft = docElem.clientLeft || body.clientLeft || 0,
                scrollTop  = doc.pageYOffset || docElem.scrollTop  || body.scrollTop,
                scrollLeft = doc.pageXOffset || docElem.scrollLeft || body.scrollLeft,
                top  = box.top  + scrollTop  - clientTop,
                left = box.left + scrollLeft - clientLeft;
            res = [left, top];
            return res;
        },

        /**
         * Gets the scroll of the element
         *
         * @method scroll
         * @param {DOMElement|String} [elm] Target element or document.body
         * @returns {Array} offset values for x and y scroll
         * @sample Ink_Dom_Element_1_scroll.html
         */
        scroll: function(elm) {
            elm = elm ? Ink.i(elm) : document.body;
            return [
                ( ( !window.pageXOffset ) ? elm.scrollLeft : window.pageXOffset ),
                ( ( !window.pageYOffset ) ? elm.scrollTop : window.pageYOffset )
            ];
        },

        _getPropPx: function(cs, prop) {
            var n, c;
            var val = cs.getPropertyValue ? cs.getPropertyValue(prop) : cs[prop];
            if (!val) { n = 0; }
            else {
                c = val.indexOf('px');
                if (c === -1) { n = 0; }
                else {
                    n = parseFloat(val, 10);
                }
            }

            //console.log([prop, ' "', val, '" ', n].join(''));

            return n;
        },

        /**
         * Alias for offset()
         *
         * @method offset2
         * @deprecated Kept for historic reasons. Use offset() instead.
         */
        offset2: function(el) {
            return InkElement.offset(el);
        },

        /**
         * Checks if an element has an attribute
         *
         * @method hasAttribute
         * @param {Object} elm   Target element
         * @param {String} attr  Attribute name
         * @return {Boolean} Boolean based on existance of attribute
         * @sample Ink_Dom_Element_1_hasAttribute.html
         */
        hasAttribute: function(elm, attr){
            elm = Ink.i(elm);
            return elm.hasAttribute ? elm.hasAttribute(attr) : !!elm.getAttribute(attr);
        },
        /**
         * Inserts an element right after another
         *
         * @method insertAfter
         * @param {DOMElement}         newElm     Element to be inserted
         * @param {DOMElement|String}  targetElm  Key element
         * @sample Ink_Dom_Element_1_insertAfter.html
         */
        insertAfter: function(newElm, targetElm) {
            /*jshint boss:true */
            if (targetElm = InkElement.get(targetElm)) {
                if (targetElm.nextSibling !== null) {
                    targetElm.parentNode.insertBefore(newElm, targetElm.nextSibling);
                } else {
                    targetElm.parentNode.appendChild(newElm);
                }
            }
        },

        /**
         * Inserts an element before another
         *
         * @method insertBefore
         * @param {DOMElement}         newElm     Element to be inserted
         * @param {DOMElement|String}  targetElm  Key element
         * @sample Ink_Dom_Element_1_insertBefore.html
         */
        insertBefore: function (newElm, targetElm) {
            /*jshint boss:true */
            if ( (targetElm = InkElement.get(targetElm)) ) {
                targetElm.parentNode.insertBefore(newElm, targetElm);
            }
        },

        /**
         * Inserts an element as the first child of another
         *
         * @method insertTop
         * @param {DOMElement}         newElm     Element to be inserted
         * @param {DOMElement|String}  targetElm  Key element
         * @sample Ink_Dom_Element_1_insertTop.html
         */
        insertTop: function(newElm,targetElm) {
            /*jshint boss:true */
            if (targetElm = InkElement.get(targetElm)) {
                if (targetElm.firstChild) {
                    targetElm.insertBefore(newElm, targetElm.firstChild);
                } else {
                    targetElm.appendChild(newElm);
                }
            }
        },

        /**
         * Inserts an element as the last child of another
         *
         * @method insertBottom
         * @param {DOMElement}         newElm     Element to be inserted
         * @param {DOMElement|String}  targetElm  Key element
         * @sample Ink_Dom_Element_1_insertBottom.html
         */
        insertBottom: function(newElm, targetElm) {
            /*jshint boss:true */
            targetElm = Ink.i(targetElm);
            targetElm.appendChild(newElm);
        },

        /**
         * Retrieves textContent from node
         *
         * @method textContent
         * @param {DOMNode} node Where to retreive text from. Can be any node type.
         * @return {String} the text
         * @sample Ink_Dom_Element_1_textContent.html
         */
        textContent: function(node){
            node = Ink.i(node);
            var text, k, cs, m;

            switch(node && node.nodeType) {
            case 9: /*DOCUMENT_NODE*/
                // IE quirks mode does not have documentElement
                return InkElement.textContent(node.documentElement || node.body && node.body.parentNode || node.body);

            case 1: /*ELEMENT_NODE*/
                text = node.innerText;
                if (typeof text !== 'undefined') {
                    return text;
                }
                /* falls through */
            case 11: /*DOCUMENT_FRAGMENT_NODE*/
                text = node.textContent;
                if (typeof text !== 'undefined') {
                    return text;
                }

                if (node.firstChild === node.lastChild) {
                    // Common case: 0 or 1 children
                    return InkElement.textContent(node.firstChild);
                }

                text = [];
                cs = node.childNodes;
                for (k = 0, m = cs.length; k < m; ++k) {
                    text.push( InkElement.textContent( cs[k] ) );
                }
                return text.join('');

            case 3: /*TEXT_NODE*/
            case 4: /*CDATA_SECTION_NODE*/
                return node.nodeValue;
            }
            return '';
        },

        /**
         * Replaces text content of a DOM Node
         * This method removes any child node previously present
         *
         * @method setTextContent
         * @param {DOMNode} node    node Target node where the text will be added.
         * @param {String}  text    text Text to be added on the node.
         * @sample Ink_Dom_Element_1_setTextContent.html
         */
        setTextContent: function(node, text){
            node = Ink.i(node);
            switch(node && node.nodeType)
            {
            case 1: /*ELEMENT_NODE*/
                if ('innerText' in node) {
                    node.innerText = text;
                    break;
                }
                /* falls through */
            case 11: /*DOCUMENT_FRAGMENT_NODE*/
                if ('textContent' in node) {
                    node.textContent = text;
                    break;
                }
                /* falls through */
            case 9: /*DOCUMENT_NODE*/
                while(node.firstChild) {
                    node.removeChild(node.firstChild);
                }
                if (text !== '') {
                    var doc = node.ownerDocument || node;
                    node.appendChild(doc.createTextNode(text));
                }
                break;

            case 3: /*TEXT_NODE*/
            case 4: /*CDATA_SECTION_NODE*/
                node.nodeValue = text;
                break;
            }
        },

        /**
         * Checks if an element is a link
         *
         * @method isLink
         * @param {DOMNode} node    Node to check if it's link
         * @return {Boolean}
         * @sample Ink_Dom_Element_1_isLink.html
         */
        isLink: function(element){
            var b = element && element.nodeType === 1 && ((/^a|area$/i).test(element.tagName) ||
                element.hasAttributeNS && element.hasAttributeNS('http://www.w3.org/1999/xlink','href'));
            return !!b;
        },

        /**
         * Checks if a node is an ancestor of another
         *
         * @method isAncestorOf
         * @param {DOMNode} ancestor  Ancestor node
         * @param {DOMNode} node      Descendant node
         * @return {Boolean}
         * @sample Ink_Dom_Element_1_isAncestorOf.html
         */
        isAncestorOf: function(ancestor, node){
            /*jshint boss:true */
            if (!node || !ancestor) {
                return false;
            }
            if (node.compareDocumentPosition) {
                return (ancestor.compareDocumentPosition(node) & 0x10) !== 0;/*Node.DOCUMENT_POSITION_CONTAINED_BY*/
            }
            while (node = node.parentNode){
                if (node === ancestor){
                    return true;
                }
            }
            return false;
        },

        /**
         * Checks if a node is descendant of another
         *
         * @method descendantOf
         * @param {DOMNode} node        The ancestor
         * @param {DOMNode} descendant  The descendant
         * @return {Boolean} true if 'descendant' is descendant of 'node'
         * @sample Ink_Dom_Element_1_descendantOf.html
         */
        descendantOf: function(node, descendant){
            return node !== descendant && InkElement.isAncestorOf(node, descendant);
        },

        /**
         * Get first child element of another
         * @method firstElementChild
         * @param {DOMElement} elm Parent node
         * @return {DOMElement} the Element child
         * @sample Ink_Dom_Element_1_firstElementChild.html
         */
        firstElementChild: function(elm){
            if(!elm) {
                return null;
            }
            if ('firstElementChild' in elm) {
                return elm.firstElementChild;
            }
            var child = elm.firstChild;
            while(child && child.nodeType !== 1) {
                child = child.nextSibling;
            }
            return child;
        },

        /**
         * Get the last child element of another
         * @method lastElementChild
         * @param {DOMElement} elm Parent node
         * @return {DOMElement} the Element child
         * @sample Ink_Dom_Element_1_lastElementChild.html
         */
        lastElementChild: function(elm){
            if(!elm) {
                return null;
            }
            if ('lastElementChild' in elm) {
                return elm.lastElementChild;
            }
            var child = elm.lastChild;
            while(child && child.nodeType !== 1) {
                child = child.previousSibling;
            }
            return child;
        },

        /**
         * Get the first sibling element after the node
         *
         * @method nextElementSibling
         * @param {DOMNode} node  The current node
         * @return {DOMElement|Null} The first sibling element after node or null if none is found
         * @sample Ink_Dom_Element_1_nextElementSibling.html 
         */
        nextElementSibling: function(node){
            var sibling = null;

            if(!node){ return sibling; }

            if("nextElementSibling" in node){
                return node.nextElementSibling;
            } else {
                sibling = node.nextSibling;

                // 1 === Node.ELEMENT_NODE
                while(sibling && sibling.nodeType !== 1){
                    sibling = sibling.nextSibling;
                }

                return sibling;
            }
        },

        /**
         * Get the first sibling element before the node
         *
         * @method previousElementSibling
         * @param {DOMNode}        node The current node
         * @return {DOMElement|Null} The first element sibling before node or null if none is found
         * @sample Ink_Dom_Element_1_previousElementSibling.html 
         */
        previousElementSibling: function(node){
            var sibling = null;

            if(!node){ return sibling; }

            if("previousElementSibling" in node){
                return node.previousElementSibling;
            } else {
                sibling = node.previousSibling;

                // 1 === Node.ELEMENT_NODE
                while(sibling && sibling.nodeType !== 1){
                    sibling = sibling.previousSibling;
                }

                return sibling;
            }
        },

        /**
         * Get an element's width in pixels.
         *
         * @method elementWidth
         * @param {DOMElement|String} element Target DOM element or target ID
         * @return {Number} The element's width
         * @sample Ink_Dom_Element_1_elementWidth.html 
         */
        elementWidth: function(element) {
            if(typeof element === "string") {
                element = document.getElementById(element);
            }
            return element.offsetWidth;
        },

        /**
         * Get an element's height in pixels.
         *
         * @method elementHeight
         * @param {DOMElement|String} element DOM element or target ID
         * @return {Number} The element's height
         * @sample Ink_Dom_Element_1_elementHeight.html 
         */
        elementHeight: function(element) {
            if(typeof element === "string") {
                element = document.getElementById(element);
            }
            return element.offsetHeight;
        },

        /**
         * Deprecated. Alias for offsetLeft()
         *
         * @method elementLeft
         * @param {DOMElement|String}       element     DOM element or target ID
         * @return {Number} Element's left position
         */
        elementLeft: function(element) {
            return InkElement.offsetLeft(element);
        },

        /**
         * Deprecated. Alias for offsetTop()
         *
         * @method elementTop
         * @param {DOMElement|string}   element     Target DOM element or target ID
         * @return {Number} element's top position
         */
        elementTop: function(element) {
            return InkElement.offsetTop(element);
        },

        /**
         * Get an element's dimensions in pixels.
         *
         * @method elementDimensions
         * @param {DOMElement|string}   element     DOM element or target ID
         * @return {Array} Array with element's width and height
         * @sample Ink_Dom_Element_1_elementDimensions.html 
         */
        elementDimensions: function(element) {
            element = Ink.i(element);
            return [element.offsetWidth, element.offsetHeight];
        },

        /**
         * Get the outer dimensions of an element in pixels.
         *
         * @method outerDimensions
         * @uses Ink.Dom.Css
         *
         * @param {DOMElement} element Target element
         * @return {Array} Array with element width and height.
         * @sample Ink_Dom_Element_1_outerDimensions.html 
         */
        outerDimensions: function (element) {
            var bbox = rect(element);

            var Css = Ink.getModule('Ink.Dom.Css_1');
            var getStyle = Ink.bindMethod(Css, 'getStyle', element);

            return [
                bbox.right - bbox.left + parseFloat(getStyle('marginLeft') || 0) + parseFloat(getStyle('marginRight') || 0),  // w
                bbox.bottom - bbox.top + parseFloat(getStyle('marginTop') || 0) + parseFloat(getStyle('marginBottom') || 0)  // h
            ];
        },

        /**
         * Check if an element is inside the viewport
         *
         * @method inViewport
         * @param {DOMElement} element DOM Element
         * @param {Object}  [options]  Options object. If you pass a Boolean value here, it is interpreted as `options.partial`
         * @param {Boolean} [options.partial]=false    Return `true` even if it is only partially visible.
         * @param {Number}  [options.margin]=0         Consider a margin all around the viewport with `opts.margin` width a dead zone.
         * @return {Boolean}
         * @sample Ink_Dom_Element_1_inViewport.html 
         */
        inViewport: function (element, opts) {
            var dims = rect(Ink.i(element));
            if (typeof opts === 'boolean') {
                opts = {partial: opts, margin: 0};
            }
            opts = Ink.extendObj({ partial: false, margin: 0}, opts || {});
            if (opts.partial) {
                return  dims.bottom + opts.margin > 0                           && // from the top
                        dims.left   - opts.margin < InkElement.viewportWidth()  && // from the right
                        dims.top    - opts.margin < InkElement.viewportHeight() && // from the bottom
                        dims.right  + opts.margin > 0;                             // from the left
            } else {
                return  dims.top    + opts.margin > 0                           && // from the top
                        dims.right  - opts.margin < InkElement.viewportWidth()  && // from the right
                        dims.bottom - opts.margin < InkElement.viewportHeight() && // from the bottom
                        dims.left   + opts.margin > 0;                             // from the left
            }
        },

        /**
         * Check if an element is hidden.
         * Taken from Mootools Element extras ( https://gist.github.com/cheeaun/73342 )
         * Does not take into account visibility:hidden
         * @method isHidden
         * @param {DOMElement} element Element to check
         * @return {Boolean}
         * @sample Ink_Dom_Element_1_isHidden.html 
         */

        isHidden: function (element) {
            var w = element.offsetWidth, 
                h = element.offsetHeight,
                force = (element.tagName.toLowerCase() === 'tr');

            var Css = Ink.getModule('Ink.Dom.Css_1');

            return (w===0 && h===0 && !force) ? true :
                (w!==0 && h!==0 && !force) ? false :
                Css.getStyle(element, 'display').toLowerCase() === 'none';
         },

        /**
         * Check if an element is visible 
         *
         * @method isVisible
         * @uses isHidden
         * @param {DOMElement} element Element to check
         * @return {Boolean}
         * @sample Ink_Dom_Element_1_isVisible.html 
         */

        isVisible: function (element) {
            return !this.isHidden(element);
        },

        /**
         * Clones an element's position to another
         *
         * @method clonePosition
         * @param {DOMElement} cloneTo    element to be position cloned
         * @param {DOMElement} cloneFrom  element to get the cloned position
         * @return {DOMElement} The element with positionClone
         * @sample Ink_Dom_Element_1_clonePosition.html 
         */
        clonePosition: function(cloneTo, cloneFrom){
            var pos = InkElement.offset(cloneFrom);
            cloneTo.style.left = pos[0]+'px';
            cloneTo.style.top = pos[1]+'px';

            return cloneTo;
        },

        /**
         * Text-overflow: ellipsis emulation
         * Slic},

        /**
         * Strips HTML tags from strings
         *
         * @method stripTags
         * @param   {String} string     String to strip tags from.
         * @param   {String} allowed    Comma separated list of allowed tags.
         * @return  {String}            Stripped string
         * @public
         * @static
         * @sample Ink_Util_String_stripTags.html 
         */
        stripTags: function(string, allowed)
        {
            if (allowed && typeof allowed === 'string') {
                var aAllowed = InkUtilString.trim(allowed).split(',');
                var aNewAllowed = [];
                var cleanedTag = false;
                for(var i=0; i < aAllowed.length; i++) {
                    if(InkUtilString.trim(aAllowed[i]) !== '') {
                        cleanedTag = InkUtilString.trim(aAllowed[i].replace(/(<|\>)/g, '').replace(/\s/, ''));
                        aNewAllowed.push('(<'+cleanedTag+'\\s[^>]+>|<(\\s|\\/)?(\\s|\\/)?'+cleanedTag+'>)');
                    }
                }
                var strAllowed = aNewAllowed.join('|');
                var reAllowed = new RegExp(strAllowed, "i");

                var aFoundTags = string.match(new RegExp("<[^>]*>", "g"));

                for(var j=0; j < aFoundTags.length; j++) {
                    if(!aFoundTags[j].match(reAllowed)) {
                        string = string.replace((new RegExp(aFoundTags[j], "gm")), '');
                    }
                }
                return string;
            } else {
                return string.replace(/<[^\>]+\>/g, '');
            }
        },

        /**
         * Encodes string into HTML entities.
         *
         * @method htmlEntitiesEncode
         * @param {String} string
         * @return {String} string encoded
         * @public
         * @static
         * @sample Ink_Util_String_htmlEntitiesEncode.html 
         */
        htmlEntitiesEncode: function(string)
        {
            if (string && string.replace) {
                var re = false;
                for (var i = 0; i < InkUtilString._chars.length; i++) {
                    re = new RegExp(InkUtilString._chars[i], "gm");
                    string = string.replace(re, '&' + InkUtilString._entities[i] + ';');
                }
            }
            return string;
        },

        /**
         * Decodes string from HTML entities.
         *
         * @method htmlEntitiesDecode
         * @param   {String}    string  String to be decoded
         * @return  {String}            Decoded string
         * @public
         * @static
         * @sample Ink_Util_String_htmlEntitiesDecode.html 
         */
        htmlEntitiesDecode: function(string)
        {
            if (string && string.replace) {
                var re = false;
                for (var i = 0; i < InkUtilString._entities.length; i++) {
                    re = new RegExp("&"+InkUtilString._entities[i]+";", "gm");
                    string = string.replace(re, InkUtilString._chars[i]);
                }
                string = string.replace(/&#[^;]+;?/g, function($0){
                    if ($0.charAt(2) === 'x') {
                        return String.fromCharCode(parseInt($0.substring(3), 16));
                    }
                    else {
                        return String.fromCharCode(parseInt($0.substring(2), 10));
                    }
                });
            }
            return string;
        },

        /**
         * Encode a string to UTF-8.
         *
         * @method utf8Encode
         * @param   {String}    string      String to be encoded
         * @return  {String}    string      UTF-8 encoded string
         * @public
         * @static
         */
        utf8Encode: function(string) {
            /*jshint bitwise:false*/
            string = string.replace(/\r\n/g,"\n");
            var utfstring = "";

            for (var n = 0; n < string.length; n++) {

                var c = string.charCodeAt(n);

                if (c < 128) {
                    utfstring += String.fromCharCode(c);
                }
                else if((c > 127) && (c < 2048)) {
                    utfstring += String.fromCharCode((c >> 6) | 192);
                    utfstring += String.fromCharCode((c & 63) | 128);
                }
                else {
                    utfstring += String.fromCharCode((c >> 12) | 224);
                    utfstring += String.fromCharCode(((c >> 6) & 63) | 128);
                    utfstring += String.fromCharCode((c & 63) | 128);
                }

            }
            return utfstring;
        },

        /**
         * Truncates a string without breaking words.
         *
         * @method shortString
         * @param   {String}    str     String to truncate
         * @param   {Number}    n       Number of chars of the short string
         * @return  {String}        
         * @public
         * @static
         * @sample Ink_Util_String_shortString.html 
         */
        shortString: function(str,n) {
          var words = str.split(' ');
          var resultstr = '';
          for(var i = 0; i < words.length; i++ ){
            if((resultstr + words[i] + ' ').length>=n){
              resultstr += '&hellip;';
              break;
              }
            resultstr += words[i] + ' ';
            }
          return resultstr;
        },

        /**
         * Truncates a string, breaking words and adding ... at the end.
         *
         * @method truncateString
         * @param   {String} str        String to truncate
         * @param   {Number} length     Limit for the returned string, ellipsis included.
         * @return  {String}            Truncated String
         * @public
         * @static
         * @sample Ink_Util_String_truncateString.html 
         */
        truncateString: function(str, length) {
            if(str.length - 1 > length) {
                return str.substr(0, length - 1) + "\u2026";
            } else {
                return str;
            }
        },

        /**
         * Decodes a string from UTF-8.
         *
         * @method utf8Decode
         * @param   {String} string     String to be decoded
         * @return  {String}            Decoded string
         * @public
         * @static
         */
        utf8Decode: function(utfstring) {
            /*jshint bitwise:false*/
            var string = "";
            var i = 0, c = 0, c2 = 0, c3 = 0;

            while ( i < utfstring.length ) {

                c = utfstring.charCodeAt(i);

                if (c < 128) {
                    string += String.fromCharCode(c);
                    i++;
                }
                else if((c > 191) && (c < 224)) {
                    c2 = utfstring.charCodeAt(i+1);
                    string += String.fromCharCode(((c & 31) << 6) | (c2 & 63));
                    i += 2;
                }
                else {
                    c2 = utfstring.charCodeAt(i+1);
                    c3 = utfstring.charCodeAt(i+2);
                    string += String.fromCharCode(((c & 15) << 12) | ((c2 & 63) << 6) | (c3 & 63));
                    i += 3;
                }

            }
            return string;
        },

        /**
         * Removes all accented characters from a string.
         *
         * @method removeAccentedChars
         * @param   {String} string     String to remove accents from
         * @return  {String}            String without accented chars
         * @public
         * @static
         * @sample Ink_Util_String_removeAccentedChars.html 
         */
        removeAccentedChars: function(string)
        {
            var newString = string;
            var re = false;
            for (var i = 0; i < InkUtilString._accentedChars.length; i++) {
                re = new RegExp(InkUtilString._accentedChars[i], "gm");
                newString = newString.replace(re, '' + InkUtilString._accentedRemovedChars[i] + '');
            }
            return newString;
        },

        /**
         * Count the number of occurrences of a specific needle in a haystack
         *
         * @method substrCount
         * @param   {String} haystack   String to search in
         * @param   {String} needle     String to search for
         * @return  {Number}            Number of occurrences
         * @public
         * @static
         * @sample Ink_Util_String_substrCount.html 
         */
        substrCount: function(haystack,needle)
        {
            return haystack ? haystack.split(needle).length - 1 : 0;
        },

        /**
         * Eval a JSON - We recommend you Ink.Util.Json
         *
         * @method evalJSON
         * @param   {String}    strJSON     JSON string to eval
         * @param   {Boolean}   sanitize    Flag to sanitize input
         * @return  {Object}                JS Object
         * @public
         * @static
         */
        evalJSON: function(strJSON, sanitize) {
            /* jshint evil:true */
            if( (typeof sanitize === 'undefined' || sanitize === null) || InkUtilString.isJSON(strJSON)) {
                try {
                    if(typeof(JSON) !== "undefined" && typeof(JSON.parse) !== 'undefined'){
                        return JSON.parse(strJSON);
                    }
                    return eval('('+strJSON+')');
                } catch(e) {
                    throw new Error('ERROR: Bad JSON string...');
                }
            }
        },

        /**
         * Checks if a string is a valid JSON object (string encoded)
         *
         * @method isJSON       
         * @param   {String}    str      String to check
         * @return  {Boolean}
         * @public
         * @static
         */
        isJSON: function(str)
        {
            str = str.replace(/\\./g, '@').replace(/"[^"\\\n\r]*"/g, '');
            return (/^[,:{}\[\]0-9.\-+Eaeflnr-u \n\r\t]*$/).test(str);
        },

        /**
         * Escapes unsafe html chars as HTML entities
         *
         * @method htmlEscapeUnsafe
         * @param {String} str String to escape
         * @return {String} Escaped string
         * @public
         * @static
         * @sample Ink_Util_String_htmlEscapeUnsafe.html 
         */
        htmlEscapeUnsafe: function(str){
            var chars = InkUtilString._htmlUnsafeChars;
            return str !== null ? String(str).replace(/[<>&'"]/g,function(c){return chars[c];}) : str;
        },

        /**
         * Normalizes whitespace in string.
         * String is trimmed and sequences of whitespaces are collapsed.
         *
         * @method normalizeWhitespace
         * @param   {String}    str     String to normalize
         * @return  {String}            Normalized string
         * @public
         * @static
         * @sample Ink_Util_String_normalizeWhitespace.html 
         */
        normalizeWhitespace: function(str){
            return str !== null ? InkUtilString.trim(String(str).replace(/\s+/g,' ')) : str;
        },

        /**
         * Converts string to unicode.
         *
         * @method toUnicode
         * @param   {String} str    String to convert
         * @return  {String}        Unicoded String
         * @public
         * @static
         * @sample Ink_Util_String_toUnicode.html 
         */
        toUnicode: function(str) {
            if (typeof str === 'string') {
                var unicodeString = '';
                var inInt = false;
                var theUnicode = false;
                var total = str.length;
                var i=0;

                while(i < total)
                {
                    inInt = str.charCodeAt(i);
                    if( (inInt >= 32 && inInt <= 126) ||
                            inInt === 8 ||
                            inInt === 9 ||
                            inInt === 10 ||
                            inInt === 12 ||
                            inInt === 13 ||
                            inInt === 32 ||
                            inInt === 34 ||
                            inInt === 47 ||
                            inInt === 58 ||
                            inInt === 92) {

                        /*
                        if(inInt == 34 || inInt == 92 || inInt == 47) {
                            theUnicode = '\\'+str.charAt(i);
                        } else {
                        }
                        */
                        if(inInt === 8) {
                            theUnicode = '\\b';
                        } else if(inInt === 9) {
                            theUnicode = '\\t';
                        } else if(inInt === 10) {
                            theUnicode = '\\n';
                        } else if(inInt === 12) {
                            theUnicode = '\\f';
                        } else if(inInt === 13) {
                            theUnicode = '\\r';
                        } else {
                            theUnicode = str.charAt(i);
                        }
                    } else {
                        theUnicode = str.charCodeAt(i).toString(16)+''.toUpperCase();
                        while (theUnicode.length < 4) {
                            theUnicode = '0' + theUnicode;
                        }
                        theUnicode = '\\u' + theUnicode;
                    }
                    unicodeString += theUnicode;

                    i++;
                }
                return unicodeString;
            }
        },

        /**
         * Escapes a unicode character.
         *
         * @method escape
         * @param {String}  c   Character to escape
         * @return {String} Escaped character. Returns \xXX if hex smaller than 0x100, otherwise \uXXXX
         * @public
         * @static
         * @sample Ink_Util_String_escape.html 
         */
        escape: function(c) {
            var hex = (c).charCodeAt(0).toString(16).split('');
            if (hex.length < 3) {
                while (hex.length < 2) { hex.unshift('0'); }
                hex.unshift('x');
            }
            else {
                while (hex.length < 4) { hex.unshift('0'); }
                hex.unshift('u');
            }

            hex.unshift('\\');
            return hex.join('');
        },

        /**
         * Unescapes a unicode character escape sequence
         *
         * @method unescape
         * @param   {String} es     Escape sequence
         * @return  {String}        String un-unicoded
         * @public
         * @static
         * @sample Ink_Util_String_unescape.html 
         */
        unescape: function(es) {
            var idx = es.lastIndexOf('0');
            idx = idx === -1 ? 2 : Math.min(idx, 2);
            //console.log(idx);
            var hexNum = es.substring(idx);
            //console.log(hexNum);
            var num = parseInt(hexNum, 16);
            return String.fromCharCode(num);
        },

        /**
         * Escapes a string to unicode characters
         *
         * @method escapeText
         * @param   {String}    txt             
         * @param   {Array}     [whiteList]     Whitelist of characters
         * @return  {String}                    String escaped to Unicode
         * @public
         * @static
         * @sample Ink_Util_String_escapeText.html 
         */
        escapeText: function(txt, whiteList) {
            if (whiteList === undefined) {
                whiteList = ['[', ']', '\'', ','];
            }
            var txt2 = [];
            var c, C;
            for (var i = 0, f = txt.length; i < f; ++i) {
                c = txt[i];
                C = c.charCodeAt(0);
                if (C < 32 || C > 126 && whiteList.indexOf(c) === -1) {
                    c = InkUtilString.escape(c);
                }
                txt2.push(c);
            }
            return txt2.join('');
        },

        /**
         * Regex to check escaped strings
         *
         * @property escapedCharRegex
         * @type {Regex}
         * @public
         * @readOnly
         * @static
         */
        escapedCharRegex: /(\\x[0-9a-fA-F]{2})|(\\u[0-9a-fA-F]{4})/g,

        /**
         * Unescapes a string
         *
         * @method unescapeText
         * @param {String} txt
         * @return {String} Unescaped string
         * @public
         * @static
         * @sample Ink_Util_String_unescapeText.html 
         */
        unescapeText: function(txt) {
            /*jshint boss:true */
            var m;
            while (m = InkUtilString.escapedCharRegex.exec(txt)) {
                m = m[0];
                txt = txt.replace(m, InkUtilString.unescape(m));
                InkUtilString.escapedCharRegex.lastIndex = 0;
            }
            return txt;
        },

        /**
         * Compares two strings.
         *
         * @method strcmp
         * @param   {String}    str1     First String
         * @param   {String}    str2     Second String
         * @return  {Number}
         * @public
         * @static
         * @sample Ink_Util_String_strcmp.html 
         */
        strcmp: function(str1, str2) {
            return ((str1 === str2) ? 0 : ((str1 > str2) ? 1 : -1));
        },

        /**
         * Splits a string into smaller chunks
         *
         * @method packetize
         * @param   {String} str        String to divide
         * @param   {Number} maxLen     Maximum chunk size (in characters)
         * @return  {Array}             Chunks of the original string
         * @public
         * @static
         * @sample Ink_Util_String_packetize.html 
         */
        packetize: function(str, maxLen) {
            var len = str.length;
            var parts = new Array( Math.ceil(len / maxLen) );
            var chars = str.split('');
            var sz, i = 0;
            while (len) {
                sz = Math.min(maxLen, len);
                parts[i++] = chars.splice(0, sz).join('');
                len -= sz;
            }
            return parts;
        }
    };

    return InkUtilString;

});

/**
 * URL Utilities
 * @module Ink.Util.Url_1
 * @version 1
 */

Ink.createModule('Ink.Util.Url', '1', [], function() {

    'use strict';

    /**
     * @namespace Ink.Util.Url_1
     */
    var Url = {

        /**
         * Auxiliary string for encoding
         *
         * @property _keyStr
         * @type {String}
         * @readOnly
         * @private
         */
        _keyStr : 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=',


        /**
         * Gets URL of current page
         *
         * @method getUrl
         * @return Current URL
         * @public
         * @static
         * @sample Ink_Util_Url_getUrl.html 
         */
        getUrl: function()
        {
            return window.location.href;
        },

        /**
         * Generates an URL string.
         *
         * @method genQueryString
         * @param {String} uri      Base URL
         * @param {Object} params   Object to transform to query string
         * @return {String} URI with query string set
         * @public
         * @static
         * @sample Ink_Util_Url_genQueryString.html 
         */
        genQueryString: function(uri, params) {
            var hasQuestionMark = uri.indexOf('?') !== -1;
            var sep, pKey, pValue, parts = [uri];

            for (pKey in params) {
                if (params.hasOwnProperty(pKey)) {
                    if (!hasQuestionMark) {
                        sep = '?';
                        hasQuestionMark = true;
                    } else {
                        sep = '&';
                    }
                    pValue = params[pKey];
                    if (typeof pValue !== 'number' && !pValue) {
                        pValue = '';
                    }
                    parts = parts.concat([sep, encodeURIComponent(pKey), '=', encodeURIComponent(pValue)]);
                }
            }

            return parts.join('');
        },

        /**
         * Gets an object from an URL encoded string.
         *
         * @method getQueryString
         * @param   {String} [str]      URL String. When not specified it uses the current URL.
         * @return  {Object}            Key-Value pair object
         * @public
         * @static
         * @sample Ink_Util_Url_getQueryString.html 
         */
        getQueryString: function(str)
        {
            var url;
            if(str && typeof(str) !== 'undefined') {
                url = str;
            } else {
                url = this.getUrl();
            }
            var aParams = {};
            if(url.match(/\?(.+)/i)) {
                var queryStr = url.replace(/^(.*)\?([^\#]+)(\#(.*))?/g, "$2");
                if(queryStr.length > 0) {
                    var aQueryStr = queryStr.split(/[;&]/);
                    for(var i=0; i < aQueryStr.length; i++) {
                        var pairVar = aQueryStr[i].split('=');
                        aParams[decodeURIComponent(pairVar[0])] = (typeof(pairVar[1]) !== 'undefined' && pairVar[1]) ? decodeURIComponent(pairVar[1]) : false;
                    }
                }
            }
            return aParams;
        },

        /**
         * Gets the URL hash value
         *
         * @method getAnchor
         * @param   {String}            [str]   URL String. Defaults to current page URL.
         * @return  {String|Boolean}            Hash in the URL. If there's no hash, returns false.
         * @public
         * @static
         * @sample Ink_Util_Url_getAnchor.html 
         */
        getAnchor: function(str)
        {
            var url;
            if(str && typeof(str) !== 'undefined') {
                url = str;
            } else {
                url = this.getUrl();
            }
            var anchor = false;
            if(url.match(/#(.+)/)) {
                anchor = url.replace(/([^#]+)#(.*)/, "$2");
            }
            return anchor;
        },

        /**
         * Gets the anchor string of an URL
         *
         * @method getAnchorString
         * @param   {String} [string]   URL to parse. Defaults to current URL.
         * @return  {Object}            Key-value pair object of the URL's hashtag 'variables'
         * @public
         * @static
         * @sample Ink_Util_Url_getAnchorString.html 
         */
        getAnchorString: function(string)
        {
            var url;
            if(string && typeof(string) !== 'undefined') {
                url = string;
            } else {
                url = this.getUrl();
            }
            var aParams = {};
            if(url.match(/#(.+)/i)) {
                var anchorStr = url.replace(/^([^#]+)#(.*)?/g, "$2");
                if(anchorStr.length > 0) {
                    var aAnchorStr = anchorStr.split(/[;&]/);
                    for(var i=0; i < aAnchorStr.length; i++) {
                        var pairVar = aAnchorStr[i].split('=');
                        aParams[decodeURIComponent(pairVar[0])] = (typeof(pairVar[1]) !== 'undefined' && pairVar[1]) ? decodeURIComponent(pairVar[1]) : false;
                    }
                }
            }
            return aParams;
        },


        /**
         * Parses URL string into URL parts
         *
         * @method parseUrl
         * @param {String} url URL to be parsed
         * @return {Object} Parsed URL as a key-value object.
         * @public
         * @static
         * @sample Ink_Util_Url_parseUrl.html 
         */
        parseUrl: function(url) {
            var aURL = {};
            if(url && typeof url === 'string') {
                if(url.match(/^([^:]+):\/\//i)) {
                    var re = /^([^:]+):\/\/([^\/]*)\/?([^\?#]*)\??([^#]*)#?(.*)/i;
                    if(url.match(re)) {
                        aURL.scheme   = url.replace(re, "$1");
                        aURL.host     = url.replace(re, "$2");
                        aURL.path     = '/'+url.replace(re, "$3");
                        aURL.query    = url.replace(re, "$4") || false;
                        aURL.fragment = url.replace(re, "$5") || false;
                    }
                } else {
                    var re1 = new RegExp("^([^\\?]+)\\?([^#]+)#(.*)", "i");
                    var re2 = new RegExp("^([^\\?]+)\\?([^#]+)#?", "i");
                    var re3 = new RegExp("^([^\\?]+)\\??", "i");
                    if(url.match(re1)) {
                        aURL.scheme   = false;
                        aURL.host     = false;
                        aURL.path     = url.replace(re1, "$1");
                        aURL.query    = url.replace(re1, "$2");
                        aURL.fragment = url.replace(re1, "$3");
                    } else if(url.match(re2)) {
                        aURL.scheme = false;
                        aURL.host   = false;
                        aURL.path   = url.replace(re2, "$1");
                        aURL.query  = url.replace(re2, "$2");
                        aURL.fragment = false;
                    } else if(url.match(re3)) {
                        aURL.scheme   = false;
                        aURL.host     = false;
                        aURL.path     = url.replace(re3, "$1");
                        aURL.query    = false;
                        aURL.fragment = false;
                    }
                }
                if(aURL.host) {
                    var regPort = /^(.*?)\\:(\\d+)$/i;
                    // check for port
                    if(aURL.host.match(regPort)) {
                        var tmpHost1 = aURL.host;
                        aURL.host = tmpHost1.replace(regPort, "$1");
                        aURL.port = tmpHost1.replace(regPort, "$2");
                    } else {
                        aURL.port = false;
                    }
                    // check for user and pass
                    if(aURL.host.match(/@/i)) {
                        var tmpHost2 = aURL.host;
                        aURL.host = tmpHost2.split('@')[1];
                        var tmpUserPass = tmpHost2.split('@')[0];
                        if(tmpUserPass.match(/\:/)) {
                            aURL.user = tmpUserPass.split(':')[0];
                            aURL.pass = tmpUserPass.split(':')[1];
                        } else {
                            aURL.user = tmpUserPass;
                            aURL.pass = false;
                        }
                    }
                }
            }
            return aURL;
        },

        /**
         * Formats an URL object into an URL string.
         *
         * @method format
         * @param urlObj Window.location, a.href, or parseUrl object to format
         * @return {String} Full URL.
         */
        format: function (urlObj) {
            var protocol = '';
            var host = '';
            var path = '';
            var frag = '';
            var query = '';

            if (typeof urlObj.protocol === 'string') {
                protocol = urlObj.protocol + '//';  // here it comes with the colon
            } else if (typeof urlObj.scheme === 'string')  {
                protocol = urlObj.scheme + '://';
            }

            host = urlObj.host || urlObj.hostname || '';
            path = urlObj.path || '';

            if (typeof urlObj.query === 'string') {
                query = urlObj.query;
            } else if (typeof urlObj.search === 'string') {
                query = urlObj.search.replace(/^\?/, '');
            }
            if (typeof urlObj.fragment === 'string') {
                frag =  urlObj.fragment;
            } else if (typeof urlObj.hash === 'string') {
                frag = urlObj.hash.replace(/#$/, '');
            }

            return [
                protocol,
                host,
                path,
                query && '?' + query,
                frag && '#' + frag
            ].join('');
        },

        /**
         * Gets the last loaded script element
         *
         * @method currentScriptElement
         * @param {String} [match] String to match against the script src attribute
         * @return {DOMElement|Boolean} Returns the `script` DOM Element or false if unable to find it.
         * @public
         * @static
         * @sample Ink_Util_Url_currentScriptElement.html 
         */
        currentScriptElement: function(match)
        {
            var aScripts = document.getElementsByTagName('script');
            if(typeof(match) === 'undefined') {
                if(aScripts.length > 0) {
                    return aScripts[(aScripts.length - 1)];
                } else {
                    return false;
                }
            } else {
                var curScript = false;
                var re = new RegExp(""+match+"", "i");
                for(var i=0, total = aScripts.length; i < total; i++) {
                    curScript = aScripts[i];
                    if(re.test(curScript.src)) {
                        return curScript;
                    }
                }
                return false;
            }
        },

        
        /*
        base64Encode: function(string)
        {
            /**
         * --function {String} ?
         * --Convert a string to BASE 64
         * @param {String} string - string to convert
         * @return base64 encoded string
         *
         * 
            if(!SAPO.Utility.String || typeof(SAPO.Utility.String) === 'undefined') {
                throw "SAPO.Utility.Url.base64Encode depends of SAPO.Utility.String, which has not been referred.";
            }

            var output = "";
            var chr1, chr2, chr3, enc1, enc2, enc3, enc4;
            var i = 0;

            var input = SAPO.Utility.String.utf8Encode(string);

            while (i < input.length) {

                chr1 = input.charCodeAt(i++);
                chr2 = input.charCodeAt(i++);
                chr3 = input.charCodeAt(i++);

                enc1 = chr1 >> 2;
                enc2 = ((chr1 & 3) << 4) | (chr2 >> 4);
                enc3 = ((chr2 & 15) << 2) | (chr3 >> 6);
                enc4 = chr3 & 63;

                if (isNaN(chr2)) {
                    enc3 = enc4 = 64;
                } else if (isNaN(chr3)) {
                    enc4 = 64;
                }

                output = output +
                this._keyStr.charAt(enc1) + this._keyStr.charAt(enc2) +
                this._keyStr.charAt(enc3) + this._keyStr.charAt(enc4);
            }
            return output;
        },
        base64Decode: function(string)
        {
         * --function {String} ?
         * Decode a BASE 64 encoded string
         * --param {String} string base64 encoded string
         * --return string decoded
            if(!SAPO.Utility.String || typeof(SAPO.Utility.String) === 'undefined') {
                throw "SAPO.Utility.Url.base64Decode depends of SAPO.Utility.String, which has not been referred.";
            }

            var output = "";
            var chr1, chr2, chr3;
            var enc1, enc2, enc3, enc4;
            var i = 0;

            var input = string.replace(/[^A-Za-z0-9\+\/\=]/g, "");

            while (i < input.length) {

                enc1 = this._keyStr.indexOf(input.charAt(i++));
                enc2 = this._keyStr.indexOf(input.charAt(i++));
                enc3 = this._keyStr.indexOf(input.charAt(i++));
                enc4 = this._keyStr.indexOf(input.charAt(i++));

                chr1 = (enc1 << 2) | (enc2 >> 4);
                chr2 = ((enc2 & 15) << 4) | (enc3 >> 2);
                chr3 = ((enc3 & 3) << 6) | enc4;

                output = output + String.fromCharCode(chr1);

                if (enc3 !== 64) {
                    output = output + String.fromCharCode(chr2);
                }
                if (enc4 !== 64) {
                    output = output + String.fromCharCode(chr3);
                }
            }
            output = SAPO.Utility.String.utf8Decode(output);
            return output;
        },
        */


        /**
         * Debug function ?
         *
         * @method _debug
         * @private
         * @static
         */
        _debug: function() {}

    };

    return Url;

});

/**
 * Validation Utilities
 * @module Ink.Util.Validator_1
 * @version 1
 */
 
Ink.createModule('Ink.Util.Validator', '1', [], function() {

    'use strict';

    /**
     * @namespace Ink.Util.Validator_1 
     */
    var Validator = {

        /**
         * List of country codes avaible for the isPhone method
         *
         * @property _countryCodes
         * @type {Array}
         * @private
         * @static
         * @readOnly
         */
        _countryCodes : [
                        'AO',
                        'CV',
                        'MZ',
                        'PT'
                    ],

        /**
         * International number for portugal
         *
         * @property _internacionalPT
         * @type {Number}
         * @private
         * @static
         * @readOnly
         *
         */
        _internacionalPT: 351,

        /**
         * List of all portuguese number prefixes
         *
         * @property _indicativosPT
         * @type {Object}
         * @private
         * @static
         * @readOnly
         *
         */
        _indicativosPT: {
                        21: 'lisboa',
                        22: 'porto',
                        231: 'mealhada',
                        232: 'viseu',
                        233: 'figueira da foz',
                        234: 'aveiro',
                        235: 'arganil',
                        236: 'pombal',
                        238: 'seia',
                        239: 'coimbra',
                        241: 'abrantes',
                        242: 'ponte de sôr',
                        243: 'santarém',
                        244: 'leiria',
                        245: 'portalegre',
                        249: 'torres novas',
                        251: 'valença',
                        252: 'vila nova de famalicão',
                        253: 'braga',
                        254: 'peso da régua',
                        255: 'penafiel',
                        256: 'são joão da madeira',
                        258: 'viana do castelo',
                        259: 'vila real',
                        261: 'torres vedras',
                        262: 'caldas da raínha',
                        263: 'vila franca de xira',
                        265: 'setúbal',
                        266: 'évora',
                        268: 'estremoz',
                        269: 'santiago do cacém',
                        271: 'guarda',
                        272: 'castelo branco',
                        273: 'bragança',
                        274: 'proença-a-nova',
                        275: 'covilhã',
                        276: 'chaves',
                        277: 'idanha-a-nova',
                        278: 'mirandela',
                        279: 'moncorvo',
                        281: 'tavira',
                        282: 'portimão',
                        283: 'odemira',
                        284: 'beja',
                        285: 'moura',
                        286: 'castro verde',
                        289: 'faro',
                        291: 'funchal, porto santo',
                        292: 'corvo, faial, flores, horta, pico',
                        295: 'angra do heroísmo, graciosa, são jorge, terceira',
                        296: 'ponta delgada, são miguel, santa maria',

                        91 : 'rede móvel 91 (Vodafone / Yorn)',
                        93 : 'rede móvel 93 (Optimus)',
                        96 : 'rede móvel 96 (TMN)',
                        92 : 'rede móvel 92 (TODOS)',
                        //925 : 'rede móvel 925 (TMN 925)',
                        //926 : 'rede móvel 926 (TMN 926)',
                        //927 : 'rede móvel 927 (TMN 927)',
                        //922 : 'rede móvel 922 (Phone-ix)',

                        707: 'número único',
                        760: 'número único',
                        800: 'número grátis',
                        808: 'chamada local',
                        30:  'voip'
                          },
        /**
         * International number for Cabo Verde
         *
         * @property _internacionalCV
         * @type {Number}
         * @private
         * @static
         * @readOnly
         */
        _internacionalCV: 238,

        /**
         * List of all Cabo Verde number prefixes
         *
         * @property _indicativosCV
         * @type {Object}
         * @private
         * @static
         * @readOnly
         */
        _indicativosCV: {
                        2: 'fixo',
                        91: 'móvel 91',
                        95: 'móvel 95',
                        97: 'móvel 97',
                        98: 'móvel 98',
                        99: 'móvel 99'
                    },
        /**
         * International number for Angola
         *
         * @property _internacionalAO
         * @type {Number}
         * @private
         * @static
         * @readOnly
         */
        _internacionalAO: 244,

        /**
         * List of all Angola number prefixes
         *
         * @property _indicativosAO
         * @type {Object}
         * @private
         * @static
         * @readOnly
         */
        _indicativosAO: {
                        2: 'fixo',
                        91: 'móvel 91',
                        92: 'móvel 92'
                    },
        /**
         * International number for Mozambique
         *
         * @property _internacionalMZ
         * @type {Number}
         * @private
         * @static
         * @readOnly
         */
        _internacionalMZ: 258,

        /**
         * List of all Mozambique number prefixes
         *
         * @property _indicativosMZ
         * @type {Object}
         * @private
         * @static
         * @readOnly
         */
        _indicativosMZ: {
                        2: 'fixo',
                        82: 'móvel 82',
                        84: 'móvel 84'
                    },

        /**
         * International number for Timor
         *
         * @property _internacionalTL
         * @type {Number}
         * @private
         * @static
         * @readOnly
         */
        _internacionalTL: 670,

        /**
         * List of all Timor number prefixes
         *
         * @property _indicativosTL
         * @type {Object}
         * @private
         * @static
         * @readOnly
         */
        _indicativosTL: {
                        3: 'fixo',
                        7: 'móvel 7'
                    },

        /**
         * Regular expression groups for several groups of characters
         *
         * http://en.wikipedia.org/wiki/C0_Controls_and_Basic_Latin
         * http://en.wikipedia.org/wiki/Plane_%28Unicode%29#Basic_Multilingual_Plane
         * http://en.wikipedia.org/wiki/ISO_8859-1
         *
         * @property _characterGroups
         * @type {Object}
         * @private
         * @static
         * @readOnly
         */
        _characterGroups: {
            numbers: ['0-9'],
            asciiAlpha: ['a-zA-Z'],
            latin1Alpha: ['a-zA-Z', '\u00C0-\u00FF'],
            unicodeAlpha: ['a-zA-Z', '\u00C0-\u00FF', '\u0100-\u1FFF', '\u2C00-\uD7FF'],
            /* whitespace characters */
            space: [' '],
            dash: ['-'],
            underscore: ['_'],
            nicknamePunctuation: ['_.-'],

            singleLineWhitespace: ['\t '],
            newline: ['\n'],
            whitespace: ['\t\n\u000B\f\r\u00A0 '],

            asciiPunctuation: ['\u0021-\u002F', '\u003A-\u0040', '\u005B-\u0060', '\u007B-\u007E'],
            latin1Punctuation: ['\u0021-\u002F', '\u003A-\u0040', '\u005B-\u0060', '\u007B-\u007E', '\u00A1-\u00BF', '\u00D7', '\u00F7'],
            unicodePunctuation: ['\u0021-\u002F', '\u003A-\u0040', '\u005B-\u0060', '\u007B-\u007E', '\u00A1-\u00BF', '\u00D7', '\u00F7', '\u2000-\u206F', '\u2E00-\u2E7F', '\u3000-\u303F']
        },

        /**
         * Creates a regular expression for several character groups.
         *
         * @method createRegExp
         *
         * @param Groups* {Object}
         *  Groups to build regular expressions for. Possible keys are:
         *
         * - **numbers**: 0-9
         * - **asciiAlpha**: a-z, A-Z
         * - **latin1Alpha**: asciiAlpha, plus printable characters in latin-1
         * - **unicodeAlpha**: unicode alphanumeric characters.
         * - **space**: ' ', the space character.
         * - **dash**: dash character.
         * - **underscore**: underscore character.
         * - **nicknamePunctuation**: dash, dot, underscore
         * - **singleLineWhitespace**: space and tab (whitespace which only spans one line).
         * - **newline**: newline character ('\n')
         * - **whitespace**: whitespace characters in the ASCII character set.
         * - **asciiPunctuation**: punctuation characters in the ASCII character set.
         * - **latin1Punctuation**: punctuation characters in latin-1.
         * - **unicodePunctuation**: punctuation characters in unicode.
         *
         */
        createRegExp: function (groups) {
            var re = '^[';
            for (var key in groups) if (groups.hasOwnProperty(key)) {
                if (!(key in Validator._characterGroups)) {
                    throw new Error('group ' + key + ' is not a valid character group');
                } else if (groups[key]) {
                    re += Validator._characterGroups[key].join('');
                }
            }
            if (re === '^[') {
                // No changes
                return new RegExp('$^'); // match nothing
            }
            return new RegExp(re + ']*?$');
        },

        /**
         * Checks if a field has the required groups.
         *
         * @method checkCharacterGroups
         * @param {String}  s               The validation string
         * @param {Object}  [groups]={}     What groups are included. See createRegexp
         * @sample Ink_Util_Validator_checkCharacterGroups.html 
         */
        checkCharacterGroups: function (s, groups) {
            return Validator.createRegExp(groups).test(s);
        },

        /**
         * Checks if a field contains unicode printable characters.
         *
         * @method unicode
         * @param {String}  s               The validation string
         * @param {Object}  [options]={}    Optional configuration object. See createRegexp
         */
        unicode: function (s, options) {
            return Validator.checkCharacterGroups(s, Ink.extendObj({
                unicodeAlpha: true}, options));
        },

        /**
         * Checks if a field only contains latin-1 alphanumeric characters. 
         * Takes options for allowing singleline whitespace, cross-line whitespace and punctuation.
         *
         * @method latin1
         *
         * @param {String}  s               The validation string
         * @param {Object}  [options]={}    Optional configuration object. See createRegexp
         * @sample Ink_Util_Validator_latin1.html  
         */
        latin1: function (s, options) {
            return Validator.checkCharacterGroups(s, Ink.extendObj({
                latin1Alpha: true}, options));
        },

        /**
         * Checks if a field only contains only ASCII alphanumeric characters. 
         * Takes options for allowing singleline whitespace, cross-line whitespace and punctuation.
         *
         * @method ascii
         *
         * @param {String}  s               The validation string
         * @param {Object}  [options]={}    Optional configuration object. See createRegexp
         * @sample Ink_Util_Validator_ascii.html 
         */
        ascii: function (s, options) {
            return Validator.checkCharacterGroups(s, Ink.extendObj({
                asciiAlpha: true}, options));
        },

        /**
         * Checks if a number is a valid
         *
         * @method number
         * @param {String} numb         The number
         * @param {Object} [options]    Further options
         *  @param  [options.decimalSep]='.'    Allow decimal separator.
         *  @param  [options.thousandSep]=","   Strip this character from the number.
         *  @param  [options.negative]=false    Allow negative numbers.
         *  @param  [options.decimalPlaces]=null   Maximum number of decimal places. Use `0` for an integer number.
         *  @param  [options.max]=null          Maximum number
         *  @param  [options.min]=null          Minimum number
         *  @param  [options.returnNumber]=false When this option is true, return the number itself when the value is valid.
         *  @sample Ink_Util_Validator_number.html 
         */
        number: function (numb, inOptions) {
            numb = numb + '';
            var options = Ink.extendObj({
                decimalSep: '.',
                thousandSep: '',
                negative: true,
                decimalPlaces: null,
                maxDigits: null,
                max: null,
                min: null,
                returnNumber: false
            }, inOptions || {});
            // smart recursion thing sets up aliases for options.
            if (options.thousandSep) {
                numb = numb.replace(new RegExp('\\' + options.thousandSep, 'g'), '');
                options.thousandSep = '';
                return Validator.number(numb, options);
            }
            if (options.negative === false) {
                options.min = 0;
                options.negative = true;
                return Validator.number(numb, options);
            }
            if (options.decimalSep !== '.') {
                numb = numb.replace(new RegExp('\\' + options.decimalSep, 'g'), '.');
            }

            if (!/^(-)?(\d+)?(\.\d+)?$/.test(numb) || numb === '') {
                return false;  // forbidden character found
            }
            
            var split;
            if (options.decimalSep && numb.indexOf(options.decimalSep) !== -1) {
                split = numb.split(options.decimalSep);
                if (options.decimalPlaces !== null &&
                        split[1].length > options.decimalPlaces) {
                    return false;
                }
            } else {
                split = ['' + numb, ''];
            }
            
            if (options.maxDigits!== null) {
                if (split[0].replace(/-/g, '').length > options.maxDigits) {
                    return split;
                }
            }
            
            // Now look at the actual float
            var ret = parseFloat(numb);
            
            if (options.maxExcl !== null && ret >= options.maxExcl ||
                    options.minExcl !== null && ret <= options.minExcl) {
                return false;
            }
            if (options.max !== null && ret > options.max ||
                    options.min !== null && ret < options.min) {
                return false;
            }
            
            if (options.returnNumber) {
                return ret;
            } else {
                return true;
            }
        },

        /**
         * Checks if a year is Leap "Bissexto"
         *
         * @method _isLeapYear
         * @param {Number} year Year to be checked
         * @return {Boolean} True if it is a leap year.
         * @private
         * @static
         * @example
         *     Ink.requireModules(['Ink.Util.Validator_1'], function( InkValidator ){
         *         console.log( InkValidator._isLeapYear( 2004 ) ); // Result: true
         *         console.log( InkValidator._isLeapYear( 2006 ) ); // Result: false
         *     });
         */
        _isLeapYear: function(year){

            var yearRegExp = /^\d{4}$/;

            if(yearRegExp.test(year)){
                return ((year%4) ? false: ((year%100) ? true : ((year%400)? false : true)) );
            }

            return false;
        },

        /**
         * Object with the date formats available for validation
         *
         * @property _dateParsers
         * @type {Object}
         * @private
         * @static
         * @readOnly
         */
        _dateParsers: {
            'yyyy-mm-dd': {day:5, month:3, year:1, sep: '-', parser: /^(\d{4})(\-)(\d{1,2})(\-)(\d{1,2})$/},
            'yyyy/mm/dd': {day:5, month:3, year:1, sep: '/', parser: /^(\d{4})(\/)(\d{1,2})(\/)(\d{1,2})$/},
            'yy-mm-dd': {day:5, month:3, year:1, sep: '-', parser: /^(\d{2})(\-)(\d{1,2})(\-)(\d{1,2})$/},
            'yy/mm/dd': {day:5, month:3, year:1, sep: '/', parser: /^(\d{2})(\/)(\d{1,2})(\/)(\d{1,2})$/},
            'dd-mm-yyyy': {day:1, month:3, year:5, sep: '-', parser: /^(\d{1,2})(\-)(\d{1,2})(\-)(\d{4})$/},
            'dd/mm/yyyy': {day:1, month:3, year:5, sep: '/', parser: /^(\d{1,2})(\/)(\d{1,2})(\/)(\d{4})$/},
            'dd-mm-yy': {day:1, month:3, year:5, sep: '-', parser: /^(\d{1,2})(\-)(\d{1,2})(\-)(\d{2})$/},
            'dd/mm/yy': {day:1, month:3, year:5, sep: '/', parser: /^(\d{1,2})(\/)(\d{1,2})(\/)(\d{2})$/}
        },

        /**
         * Gets the number of days in a given month of a given year
         *
         * @method _daysInMonth
         * @param {Number} _m Month (1 to 12)
         * @param {Number} _y Year
         * @return {Number} Returns the number of days in a given month of a given year
         * @private
         * @static
         * @example
         *     Ink.requireModules(['Ink.Util.Validator_1'], function( InkValidator ){
         *         console.log( InkValidator._daysInMonth( 2, 2004 ) ); // Result: 29
         *         console.log( InkValidator._daysInMonth( 2, 2006 ) ); // Result: 28
         *     });
         */
        _daysInMonth: function(_m,_y){
            var nDays=0;

            _m = parseInt(_m, 10);
            _y = parseInt(_y, 10);

            if(_m===1 || _m===3 || _m===5 || _m===7 || _m===8 || _m===10 || _m===12) {
                nDays= 31;
            } else if ( _m===4 || _m===6 || _m===9 || _m===11) {
                nDays = 30;
            } else if (_m===2) {
                if((_y%400===0) || (_y%4===0 && _y%100!==0)) {
                    nDays = 29;
                } else {
                    nDays = 28;
                }
            }

            return nDays;
        },



        /**
         * Checks if a date is valid
         *
         * @method _isValidDate
         * @param {Number} year
         * @param {Number} month
         * @param {Number} day
         * @return {Boolean} True if valid
         * @private
         * @static
         * @example
         *     Ink.requireModules(['Ink.Util.Validator_1'], function( InkValidator ){
         *         console.log( InkValidator._isValidDate( 2004, 2, 29 ) ); // Result: true
         *         console.log( InkValidator._isValidDate( 2006, 2, 29 ) ); // Result: false
         *     });
         */
        _isValidDate: function(year, month, day){

            var yearRegExp = /^\d{4}$/;
            var validOneOrTwo = /^\d{1,2}$/;
            if(yearRegExp.test(year) && validOneOrTwo.test(month) && validOneOrTwo.test(day)){
                if(month>=1 && month<=12 && day>=1 && this._daysInMonth(month,year)>=day){
                    return true;
                }
            }

            return false;
        },

        /**
         * Checks if an email is valid
         *
         * @method mail
         * @param {String} email
         * @return {Boolean} True if it's valid
         * @public
         * @static
         * @sample Ink_Util_Validator_mail.html 
         */
        email: function(email)
        {
            var emailValido = new RegExp("^[_a-z0-9-]+((\\.|\\+)[_a-z0-9-]+)*@([\\w]*-?[\\w]*\\.)+[a-z]{2,4}$", "i");
            if(!emailValido.test(email)) {
                return false;
            } else {
                return true;
            }
        },

        /**
         * Deprecated. Alias for email(). Use it instead.
         *
         * @method mail
         * @public
         * @static
         * @private
         */
        mail: function (mail) { return Validator.email(mail); },

        /**
         * Checks if an url is valid
         *
         * @method url
         * @param {String} url URL to be checked
         * @param {Boolean} [full] If true, validates a full URL (one that should start with 'http')
         * @return {Boolean} True if valid
         * @public
         * @static
         * @sample Ink_Util_Validator_url.html 
         */
        url: function(url, full)
        {
            if(typeof full === "undefined" || full === false) {
                var reHTTP = new RegExp("(^(http\\:\\/\\/|https\\:\\/\\/)(.+))", "i");
                if(reHTTP.test(url) === false) {
                    url = 'http://'+url;
                }
            }

            var reUrl = new RegExp("^(http:\\/\\/|https:\\/\\/)([\\w]*(-?[\\w]*)*\\.)+[a-z]{2,4}", "i");
            if(reUrl.test(url) === false) {
                return false;
            } else {
                return true;
            }
        },

        /**
         * Checks if a phone is valid in Portugal
         *
         * @method isPTPhone
         * @param {Number} phone Phone number to be checked
         * @return {Boolean} True if it's a valid Portuguese Phone
         * @public
         * @static
         * @sample Ink_Util_Validator_isPTPhone.html
         */
        isPTPhone: function(phone)
        {

            phone = phone.toString();
            var aInd = [];
            for(var i in this._indicativosPT) {
                if(typeof(this._indicativosPT[i]) === 'string') {
                    aInd.push(i);
                }
            }
            var strInd = aInd.join('|');

            var re351 = /^(00351|\+351)/;
            if(re351.test(phone)) {
                phone = phone.replace(re351, "");
            }

            var reSpecialChars = /(\s|\-|\.)+/g;
            phone = phone.replace(reSpecialChars, '');
            //var reInt = new RegExp("\\d", "i");
            var reInt = /[\d]{9}/i;
            if(phone.length === 9 && reInt.test(phone)) {
                var reValid = new RegExp("^("+strInd+")");
                if(reValid.test(phone)) {
                    return true;
                }
            }

            return false;
        },

        /**
         * Alias function for isPTPhone
         *
         * @method isPortuguesePhone
         * @param {Number} phone Phone number to be checked
         * @return {Boolean} True if it's a valid Portuguese Phone
         * @public
         * @static
         */
        isPortuguesePhone: function(phone)
        {
            return this.isPTPhone(phone);
        },

        /**
         * Checks if a phone is valid in Cabo Verde
         *
         * @method isCVPhone
         * @param {Number} phone Phone number to be checked
         * @return {Boolean} True if it's a valid Cape Verdean Phone
         * @public
         * @static
         * @sample Ink_Util_Validator_isCVPhone.html 
         */
        isCVPhone: function(phone)
        {
            phone = phone.toString();
            var aInd = [];
            for(var i in this._indicativosCV) {
                if(typeof(this._indicativosCV[i]) === 'string') {
                    aInd.push(i);
                }
            }
            var strInd = aInd.join('|');

            var re238 = /^(00238|\+238)/;
            if(re238.test(phone)) {
                phone = phone.replace(re238, "");
            }

            var reSpecialChars = /(\s|\-|\.)+/g;
            phone = phone.replace(reSpecialChars, '');
            //var reInt = new RegExp("\\d", "i");
            var reInt = /[\d]{7}/i;
            if(phone.length === 7 && reInt.test(phone)) {
                var reValid = new RegExp("^("+strInd+")");
                if(reValid.test(phone)) {
                    return true;
                }
            }

            return false;
        },

        /**
         * Checks if a phone is valid in Angola
         *
         * @method isAOPhone
         * @param {Number} phone Phone number to be checked
         * @return {Boolean} True if it's a valid Angolan Phone
         * @public
         * @static
         * @sample Ink_Util_Validator_isAOPhone.html 
         */
        isAOPhone: function(phone)
        {

            phone = phone.toString();
            var aInd = [];
            for(var i in this._indicativosAO) {
                if(typeof(this._indicativosAO[i]) === 'string') {
                    aInd.push(i);
                }
            }
            var strInd = aInd.join('|');

            var re244 = /^(00244|\+244)/;
            if(re244.test(phone)) {
                phone = phone.replace(re244, "");
            }

            var reSpecialChars = /(\s|\-|\.)+/g;
            phone = phone.replace(reSpecialChars, '');
            //var reInt = new RegExp("\\d", "i");
            var reInt = /[\d]{9}/i;
            if(phone.length === 9 && reInt.test(phone)) {
                var reValid = new RegExp("^("+strInd+")");
                if(reValid.test(phone)) {
                    return true;
                }
            }

            return false;
        },

        /**
         * Checks if a phone is valid in Mozambique
         *
         * @method isMZPhone
         * @param {Number} phone Phone number to be checked
         * @return {Boolean} True if it's a valid Mozambican Phone
         * @public
         * @static
         * @sample Ink_Util_Validator_isMZPhone.html 
         */
        isMZPhone: function(phone)
        {

            phone = phone.toString();
            var aInd = [];
            for(var i in this._indicativosMZ) {
                if(typeof(this._indicativosMZ[i]) === 'string') {
                    aInd.push(i);
                }
            }
            var strInd = aInd.join('|');
            var re258 = /^(00258|\+258)/;
            if(re258.test(phone)) {
                phone = phone.replace(re258, "");
            }

            var reSpecialChars = /(\s|\-|\.)+/g;
            phone = phone.replace(reSpecialChars, '');
            //var reInt = new RegExp("\\d", "i");
            var reInt = /[\d]{8,9}/i;
            if((phone.length === 9 || phone.length === 8) && reInt.test(phone)) {
                var reValid = new RegExp("^("+strInd+")");
                if(reValid.test(phone)) {
                   if(phone.indexOf('2') === 0 && phone.length === 8) {
                       return true;
                   } else if(phone.indexOf('8') === 0 && phone.length === 9) {
                       return true;
                   }
                }
            }

            return false;
        },

        /**
         * Checks if a phone is valid in Timor
         *
         * @method isTLPhone
         * @param {Number} phone Phone number to be checked
         * @return {Boolean} True if it's a valid phone from Timor-Leste
         * @public
         * @static
         * @sample Ink_Util_Validator_isTLPhone.html 
         */
        isTLPhone: function(phone)
        {

            phone = phone.toString();
            var aInd = [];
            for(var i in this._indicativosTL) {
                if(typeof(this._indicativosTL[i]) === 'string') {
                    aInd.push(i);
                }
            }
            var strInd = aInd.join('|');
            var re670 = /^(00670|\+670)/;
            if(re670.test(phone)) {
                phone = phone.replace(re670, "");
            }


            var reSpecialChars = /(\s|\-|\.)+/g;
            phone = phone.replace(reSpecialChars, '');
            //var reInt = new RegExp("\\d", "i");
            var reInt = /[\d]{7}/i;
            if(phone.length === 7 && reInt.test(phone)) {
                var reValid = new RegExp("^("+strInd+")");
                if(reValid.test(phone)) {
                    return true;
                }
            }

            return false;
        },

        /**
         * Checks if a number is a phone number.
         * This method validates the number in all country codes available the ones set in the second param
         *
         * @method isPhone
         * @param   {String}        phone           Phone number to validate
         * @param   {String|Array}  [countryCode]   Country code or  array of countries to validate
         * @return  {Boolean}                       True if it's a valid phone in any country available
         * @public
         * @static
         * @sample Ink_Util_Validator_isPhone.html
         */
        isPhone: function(){
            var index;

            if(arguments.length===0){
                return false;
            }

            var phone = arguments[0];

            if(arguments.length>1){
                if(arguments[1].constructor === Array){
                    var func;
                    for(index=0; index<arguments[1].length; index++ ){
                        if(typeof(func=this['is' + arguments[1][index].toUpperCase() + 'Phone'])==='function'){
                            if(func(phone)){
                                return true;
                            }
                        } else {
                            throw "Invalid Country Code!";
                        }
                    }
                } else if(typeof(this['is' + arguments[1].toUpperCase() + 'Phone'])==='function'){
                    return this['is' + arguments[1].toUpperCase() + 'Phone'](phone);
                } else {
                    throw "Invalid Country Code!";
                }
            } else {
                for(index=0; index<this._countryCodes.length; index++){
                    if(this['is' + this._countryCodes[index] + 'Phone'](phone)){
                        return true;
                    }
                }
            }
            return false;
        },

        /**
         * Validates if a zip code is valid in Portugal
         *
         * @method codPostal
         * @param {Number|String} cp1
         * @param {optional Number|String} cp2
         * @param {optional Boolean} returnBothResults
         * @return {Boolean} True if it's a valid zip code
         * @public
         * @static
         * @sample Ink_Util_Validator_codPostal.html 
         */
        codPostal: function(cp1,cp2,returnBothResults){


            var cPostalSep = /^(\s*\-\s*|\s+)$/;
            var trim = /^\s+|\s+$/g;
            var cPostal4 = /^[1-9]\d{3}$/;
            var cPostal3 = /^\d{3}$/;
            var parserCPostal = /^(.{4})(.*)(.{3})$/;


            returnBothResults = !!returnBothResults;

            cp1 = cp1.replace(trim,'');
            if(typeof(cp2)!=='undefined'){
                cp2 = cp2.replace(trim,'');
                if(cPostal4.test(cp1) && cPostal3.test(cp2)){
                    if( returnBothResults === true ){
                        return [true, true];
                    } else {
                        return true;
                    }
                }
            } else {
                if(cPostal4.test(cp1) ){
                    if( returnBothResults === true ){
                        return [true,false];
                    } else {
                        return true;
                    }
                }

                var cPostal = cp1.match(parserCPostal);

                if(cPostal!==null && cPostal4.test(cPostal[1]) && cPostalSep.test(cPostal[2]) && cPostal3.test(cPostal[3])){
                    if( returnBothResults === true ){
                        return [true,false];
                    } else {
                        return true;
                    }
                }
            }

            if( returnBothResults === true ){
                return [false,false];
            } else {
                return false;
            }
        },

        /**
         * Checks if a date is valid in a given format
         *
         * @method isDate
         * @param {String} format Format defined in _dateParsers
         * @param {String} dateStr Date string
         * @return {Boolean} True if it's a valid date and in the specified format
         * @public
         * @static
         * @sample Ink_Util_Validator_isDate.html 
         */
        isDate: function(format, dateStr){



            if(typeof(this._dateParsers[format])==='undefined'){
                return false;
            }
            var yearIndex = this._dateParsers[format].year;
            var monthIndex = this._dateParsers[format].month;
            var dayIndex = this._dateParsers[format].day;
            var dateParser = this._dateParsers[format].parser;
            var separator = this._dateParsers[format].sep;

            /* Trim Deactivated
            * var trim = /^\w+|\w+$/g;
            * dateStr = dateStr.replace(trim,"");
            */
            var data = dateStr.match(dateParser);
            if(data!==null){
                /* Trim Deactivated
                * for(i=1;i<=data.length;i++){
                *   data[i] = data[i].replace(trim,"");
                *}
                */
                if(data[2]===data[4] && data[2]===separator){

                    var _y = ((data[yearIndex].length===2) ? "20" + data[yearIndex].toString() : data[yearIndex] );

                    if(this._isValidDate(_y,data[monthIndex].toString(),data[dayIndex].toString())){
                        return true;
                    }
                }
            }


            return false;
        },

        /**
         * Checks if a string is a valid color
         *
         * @method isColor
         * @param {String} str Color string to be checked
         * @return {Boolean} True if it's a valid color string
         * @public
         * @static
         * @sample Ink_Util_Validator_isColor.html 
         */
        isColor: function(str){
            var match, valid = false,
                keyword = /^[a-zA-Z]+$/,
                hexa = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/,
                rgb = /^rgb\(\s*([0-9]{1,3})(%)?\s*,\s*([0-9]{1,3})(%)?\s*,\s*([0-9]{1,3})(%)?\s*\)$/,
                rgba = /^rgba\(\s*([0-9]{1,3})(%)?\s*,\s*([0-9]{1,3})(%)?\s*,\s*([0-9]{1,3})(%)?\s*,\s*(1(\.0)?|0(\.[0-9])?)\s*\)$/,
                hsl = /^hsl\(\s*([0-9]{1,3})\s*,\s*([0-9]{1,3})(%)?\s*,\s*([0-9]{1,3})(%)?\s*\)$/,
                hsla = /^hsla\(\s*([0-9]{1,3})\s*,\s*([0-9]{1,3})(%)?\s*,\s*([0-9]{1,3})(%)?\s*,\s*(1(\.0)?|0(\.[0-9])?)\s*\)$/;

            // rgb(123, 123, 132) 0 to 255
            // rgb(123%, 123%, 123%) 0 to 100
            // rgba( 4 vals) last val: 0 to 1.0
            // hsl(0 to 360, %, %)
            // hsla( ..., 0 to 1.0)

            if(
                keyword.test(str) ||
                hexa.test(str)
            ){
                return true;
            }

            var i;

            // rgb range check
            if((match = rgb.exec(str)) !== null || (match = rgba.exec(str)) !== null){
                i = match.length;

                while(i--){
                    // check percentage values
                    if((i===2 || i===4 || i===6) && typeof match[i] !== "undefined" && match[i] !== ""){
                        if(typeof match[i-1] !== "undefined" && match[i-1] >= 0 && match[i-1] <= 100){
                            valid = true;
                        } else {
                            return false;
                        }
                    }
                    // check 0 to 255 values
                    if(i===1 || i===3 || i===5 && (typeof match[i+1] === "undefined" || match[i+1] === "")){
                        if(typeof match[i] !== "undefined" && match[i] >= 0 && match[i] <= 255){
                            valid = true;
                        } else {
                            return false;
                        }
                    }
                }
            }

            // hsl range check
            if((match = hsl.exec(str)) !== null || (match = hsla.exec(str)) !== null){
                i = match.length;
                while(i--){
                    // check percentage values
                    if(i===3 || i===5){
                        if(typeof match[i-1] !== "undefined" && typeof match[i] !== "undefined" && match[i] !== "" &&
                        match[i-1] >= 0 && match[i-1] <= 100){
                            valid = true;
                        } else {
                            return false;
                        }
                    }
                    // check 0 to 360 value
                    if(i===1){
                        if(typeof match[i] !== "undefined" && match[i] >= 0 && match[i] <= 360){
                            valid = true;
                        } else {
                            return false;
                        }
                    }
                }
            }

            return valid;
        },

        /**
         * Checks if the value is a valid IP. 
         *
         * @method isIP
         * @param  {String} value   Value to be checked
         * @param  {String} ipType Type of IP to be validated. The values are: ipv4, ipv6. By default is ipv4.
         * @return {Boolean}         True if the value is a valid IP address. False if not.
         * @sample Ink_Util_Validator_isIP.html 
         */
        isIP: function( value, ipType ){
            if( typeof value !== 'string' ){
                return false;
            }

            ipType = (ipType || 'ipv4').toLowerCase();

            switch( ipType ){
                case 'ipv4':
                    return (/^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/).test(value);
                case 'ipv6':
                    return (/^\s*((([0-9A-Fa-f]{1,4}:){7}([0-9A-Fa-f]{1,4}|:))|(([0-9A-Fa-f]{1,4}:){6}(:[0-9A-Fa-f]{1,4}|((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3})|:))|(([0-9A-Fa-f]{1,4}:){5}(((:[0-9A-Fa-f]{1,4}){1,2})|:((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3})|:))|(([0-9A-Fa-f]{1,4}:){4}(((:[0-9A-Fa-f]{1,4}){1,3})|((:[0-9A-Fa-f]{1,4})?:((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}))|:))|(([0-9A-Fa-f]{1,4}:){3}(((:[0-9A-Fa-f]{1,4}){1,4})|((:[0-9A-Fa-f]{1,4}){0,2}:((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}))|:))|(([0-9A-Fa-f]{1,4}:){2}(((:[0-9A-Fa-f]{1,4}){1,5})|((:[0-9A-Fa-f]{1,4}){0,3}:((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}))|:))|(([0-9A-Fa-f]{1,4}:){1}(((:[0-9A-Fa-f]{1,4}){1,6})|((:[0-9A-Fa-f]{1,4}){0,4}:((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}))|:))|(:(((:[0-9A-Fa-f]{1,4}){1,7})|((:[0-9A-Fa-f]{1,4}){0,5}:((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}))|:)))(%.+)?\s*$/).test(value);
                default:
                    return false;
            }
        },

        /**
         * Credit Card specifications, to be used in the credit card verification.
         *
         * @property _creditCardSpecs
         * @type {Object}
         * @private
         */
        _creditCardSpecs: {
            'default': {
                'length': '13,14,15,16,17,18,19',
                'prefix': /^.+/,
                'luhn': true
            },

            'american express': {
                'length': '15',
                'prefix': /^3[47]/,
                'luhn'  : true
            },

            'diners club': {
                'length': '14,16',
                'prefix': /^36|55|30[0-5]/,
                'luhn'  : true
            },

            'discover': {
                'length': '16',
                'prefix': /^6(?:5|011)/,
                'luhn'  : true
            },

            'jcb': {
                'length': '15,16',
                'prefix': /^3|1800|2131/,
                'luhn'  : true
            },

            'maestro': {
                'length': '16,18',
                'prefix': /^50(?:20|38)|6(?:304|759)/,
                'luhn'  : true
            },

            'mastercard': {
                'length': '16',
                'prefix': /^5[1-5]/,
                'luhn'  : true
            },

            'visa': {
                'length': '13,16',
                'prefix': /^4/,
                'luhn'  : true
            }
        },

        /**
         * Luhn function, to be used when validating credit cards
         *
         */
        _luhn: function (num){

            num = parseInt(num,10);

            if ( (typeof num !== 'number') && (num % 1 !== 0) ){
                // Luhn can only be used on nums!
                return false;
            }

            num = num+'';
            // Check num length
            var length = num.length;

            // Checksum of the card num
            var
                i, checksum = 0
            ;

            for (i = length - 1; i >= 0; i -= 2)
            {
                // Add up every 2nd digit, starting from the right
                checksum += parseInt(num.substr(i, 1),10);
            }

            for (i = length - 2; i >= 0; i -= 2)
            {
                // Add up every 2nd digit doubled, starting from the right
                var dbl = parseInt(num.substr(i, 1) * 2,10);

                // Subtract 9 from the dbl where value is greater than 10
                checksum += (dbl >= 10) ? (dbl - 9) : dbl;
            }

            // If the checksum is a multiple of 10, the number is valid
            return (checksum % 10 === 0);
        },

        /**
         * Checks if a number is of a specific credit card type
         * @method isCreditCard
         * @param  {String}  num            Number to be validates
         * @param  {String|Array}  creditCardType Credit card type. See _creditCardSpecs for the list of supported values.
         * @return {Boolean}
         * @sample Ink_Util_Validator_isCreditCard.html 
         */
        isCreditCard: function(num, creditCardType){

            if ( /\d+/.test(num) === false ){
                return false;
            }

            if ( typeof creditCardType === 'undefined' ){
                creditCardType = 'default';
            }
            else if ( creditCardType instanceof Array ){
                var i, ccLength = creditCardType.length;
                for ( i=0; i < ccLength; i++ ){
                    // Test each type for validity
                    if (this.isCreditCard(num, creditCardType[i]) ){
                        return true;
                    }
                }

                return false;
            }

            // Check card type
            creditCardType = creditCardType.toLowerCase();

            if ( typeof this._creditCardSpecs[creditCardType] === 'undefined' ){
                return false;
            }

            // Check card number length
            var length = num.length+'';

            // Validate the card length by the card type
            if ( this._creditCardSpecs[creditCardType]['length'].split(",").indexOf(length) === -1 ){
                return false;
            }

            // Check card number prefix
            if ( !this._creditCardSpecs[creditCardType]['prefix'].test(num) ){
                return false;
            }

            // No Luhn check required
            if (this._creditCardSpecs[creditCardType]['luhn'] === false){
                return true;
            }

            return this._luhn(num);
        }
    };

    return Validator;

});
