/* ===========================================================================
 * MagicMirror module harness — runtime shim.
 *
 * Mounts a single MMM-* module (or several) with NO MagicMirror install and NO
 * server-side node_helper. It reproduces just enough of the MagicMirror²
 * front-end contract for a module to boot and render meaningful content offline
 * from a scripted fixture, so the demo pipeline can screenshot / screen-record
 * it as a static bundle.
 *
 * Source of truth : repository-definitions/pipeline/mmm-harness/harness.js
 * Deployed to     : SkylerGodfrey/portfolio-demos/pipeline/mmm-harness/harness.js
 *                   (fetched by the MMM adapter's build — see
 *                    pipeline/adapter-mmm.template.yml and docs/demo-adapters.md)
 *
 * Fully static at runtime. Everything below runs in the browser.
 *
 * ---- What it shims (the MagicMirror module API surface) --------------------
 *  Globals   : Module.register(name, def), Log.{info,log,warn,error,debug}, MM
 *  Lifecycle : start(), getScripts(), getStyles(), getTranslations(),
 *              getHeader(), getDom(), getTemplate()/getTemplateData() (stubs),
 *              suspend(), resume()
 *  Messaging : sendNotification/notificationReceived (real, in-page bus),
 *              sendSocketNotification (logged no-op — there is no node_helper),
 *              socketNotificationReceived (driven by the fixture)
 *  Helpers   : this.file(), this.translate(), this.updateDom(), hide()/show(),
 *              this.config (defaults merged with fixture config), this.data,
 *              this.name, this.identifier
 *
 * ---- Fixture schema (demo.config.json, or ?config=<url>) -------------------
 *  Single module:
 *   {
 *     "module": "MMM-Foo",            // required; must call Module.register("MMM-Foo", …)
 *     "file":   "MMM-Foo.js",         // optional; defaults to "<module>.js"
 *     "position": "top_left",         // MagicMirror region; default "middle_center"
 *     "header": "Foo",                // optional module header text
 *     "classes": "",                  // optional extra wrapper classes
 *     "config": { … },                // module config (merged over its defaults)
 *     "translations": { "KEY": "…" }, // optional this.translate() table
 *     "viewport": { "width": 1080, "height": 1920 }, // optional fixed mirror size
 *     "notifications": [              // scripted, time-ordered fake traffic
 *       { "at": 500,  "kind": "socket",       "notification": "FOO_DATA", "payload": { … } },
 *       { "at": 1500, "kind": "notification", "notification": "USER_PRESENCE", "payload": true }
 *     ]
 *   }
 *  Multiple modules: { "viewport": {…}, "modules": [ <spec>, <spec>, … ] }
 *  "kind" defaults to "notification"; "socket" delivers to socketNotificationReceived.
 * ========================================================================= */

(function () {
  "use strict";

  // --- Log shim ------------------------------------------------------------
  var Log = {
    info: function () { console.log.apply(console, ["[harness][info]"].concat([].slice.call(arguments))); },
    log: function () { console.log.apply(console, ["[harness][log]"].concat([].slice.call(arguments))); },
    warn: function () { console.warn.apply(console, ["[harness][warn]"].concat([].slice.call(arguments))); },
    error: function () { console.error.apply(console, ["[harness][error]"].concat([].slice.call(arguments))); },
    debug: function () { console.debug.apply(console, ["[harness][debug]"].concat([].slice.call(arguments))); }
  };
  window.Log = Log;

  // --- Notification bus (in-page; replaces MagicMirror core delivery) -------
  var bus = { modules: [] };
  function broadcast(notification, payload, sender) {
    bus.modules.forEach(function (m) {
      if (m === sender) return;
      try {
        m.notificationReceived(notification, payload, sender);
      } catch (e) {
        Log.error("notificationReceived(" + notification + ") threw:", e);
      }
    });
  }

  // --- Resolve a module-relative asset path to a harness bundle path --------
  // Module files are copied under "module/". this.file() already returns
  // "module/…"; bare paths from getStyles/getScripts ("MMM-Foo.css") are
  // resolved against the module folder the way MagicMirror's loader does.
  function resolveAsset(p) {
    if (!p) return p;
    if (/^(https?:)?\/\//.test(p) || p.charAt(0) === "/" || p.indexOf("data:") === 0) return p;
    if (p.indexOf("module/") === 0) return p;
    return "module/" + p.replace(/^\.\//, "");
  }

  // --- Base module prototype (subset of MagicMirror module.js) --------------
  var MMBase = {
    defaults: {},
    hidden: false,
    translations: null,

    setData: function (data) {
      this.data = data;
      this.name = data.name;
      this.identifier = data.identifier;
    },
    setConfig: function (config) {
      // MagicMirror merges config shallowly over defaults.
      this.config = Object.assign({}, this.defaults, config || {});
    },

    start: function () {},
    getScripts: function () { return []; },
    getStyles: function () { return []; },
    getTranslations: function () { return false; },
    getHeader: function () { return this.data ? this.data.header : ""; },
    getTemplate: function () { return null; },
    getTemplateData: function () { return {}; },

    getDom: function () {
      var div = document.createElement("div");
      div.innerHTML = this.name;
      return div;
    },

    notificationReceived: function () {},
    socketNotificationReceived: function () {},
    suspend: function () {},
    resume: function () {},

    file: function (filename) {
      var base = (this.data && this.data.path) ? this.data.path : "module/";
      return resolveAsset(base + (filename || ""));
    },

    translate: function (key, variables) {
      var s = (this.translations && this.translations[key]) || key;
      if (variables && typeof s === "string") {
        Object.keys(variables).forEach(function (k) {
          s = s.replace(new RegExp("\\{" + k + "\\}", "g"), variables[k]);
        });
      }
      return s;
    },

    sendNotification: function (notification, payload) {
      Log.info("sendNotification: " + notification);
      var self = this;
      setTimeout(function () { broadcast(notification, payload, self); }, 0);
    },

    // No node_helper exists in the harness. Socket sends are logged so the
    // fixture author can see what the module asked for; the *responses* are
    // simulated by scripted "socket" fixture entries.
    sendSocketNotification: function (notification, payload) {
      Log.info("sendSocketNotification (stub, no node_helper): " + notification, payload);
    },

    updateDom: function () {
      var wrapper = document.getElementById(this.identifier);
      if (!wrapper) { Log.warn("updateDom: wrapper #" + this.identifier + " missing"); return; }

      var header = wrapper.querySelector(":scope > .module-header");
      var headerText = (typeof this.getHeader === "function") ? this.getHeader() : (this.data && this.data.header);
      if (headerText) {
        header.textContent = headerText;
        wrapper.classList.remove("no-header");
      } else {
        wrapper.classList.add("no-header");
      }

      var content = wrapper.querySelector(":scope > .module-content");
      var dom = this.getDom();
      content.innerHTML = "";
      if (dom) content.appendChild(dom);
    },

    hide: function (speed, callback) {
      this.hidden = true;
      var w = document.getElementById(this.identifier);
      if (w) w.style.opacity = "0";
      if (typeof speed === "function") speed();
      else if (typeof callback === "function") callback();
    },
    show: function (speed, callback) {
      this.hidden = false;
      var w = document.getElementById(this.identifier);
      if (w) w.style.opacity = "1";
      if (typeof speed === "function") speed();
      else if (typeof callback === "function") callback();
    }
  };

  // --- Globals a MagicMirror module expects --------------------------------
  var registry = {};
  window.Module = {
    register: function (name, definition) {
      registry[name] = definition || {};
      Log.info("registered module " + name);
    },
    definitions: registry
  };
  window.MM = {
    getModules: function () { return bus.modules.slice(); },
    updateDom: function (module, speed) { if (module && module.updateDom) module.updateDom(speed); }
  };

  // --- Loader helpers -------------------------------------------------------
  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      var s = document.createElement("script");
      s.src = src;
      s.onload = function () { resolve(); };
      s.onerror = function () { reject(new Error("failed to load script " + src)); };
      document.head.appendChild(s);
    });
  }
  function loadStyle(href) {
    return new Promise(function (resolve) {
      var l = document.createElement("link");
      l.rel = "stylesheet";
      l.href = href;
      l.onload = function () { resolve(); };
      l.onerror = function () { Log.warn("style failed to load: " + href); resolve(); };
      document.head.appendChild(l);
    });
  }
  function loadJSON(url) {
    return fetch(url, { cache: "no-store" }).then(function (r) {
      if (!r.ok) throw new Error("fetch " + url + " -> " + r.status);
      return r.json();
    });
  }

  // --- Region handling ------------------------------------------------------
  function regionClasses(position) {
    // MagicMirror maps "top_left" -> "region top left",
    // "fullscreen_above" -> "region fullscreen above".
    return "region " + String(position || "middle_center").replace(/_/g, " ");
  }
  function ensureRegion(root, position) {
    var cls = regionClasses(position);
    var selector = "." + cls.trim().split(/\s+/).join(".");
    var region = root.querySelector(selector);
    if (!region) {
      region = document.createElement("div");
      region.className = cls;
      var container = document.createElement("div");
      container.className = "container";
      region.appendChild(container);
      root.appendChild(region);
    }
    return region.querySelector(".container");
  }

  // --- Mount one module -----------------------------------------------------
  function mountModule(root, spec, index) {
    var name = spec.module;
    if (!name) return Promise.reject(new Error("fixture entry missing 'module'"));
    var mainFile = spec.file || (name + ".js");

    return loadScript(resolveAsset(mainFile)).then(function () {
      var def = registry[name];
      if (!def) throw new Error("module " + name + " did not call Module.register (loaded " + mainFile + ")");

      var module = Object.assign(Object.create(MMBase), def);
      var identifier = "module_" + index + "_" + name;
      var classes = [name].concat(spec.classes ? String(spec.classes).split(/\s+/) : []).join(" ").trim();

      module.setData({
        name: name,
        identifier: identifier,
        classes: classes,
        file: mainFile,
        path: "module/",
        header: spec.header || "",
        position: spec.position || "middle_center",
        config: spec.config || {}
      });
      module.setConfig(spec.config || {});
      if (spec.translations) module.translations = spec.translations;
      bus.modules.push(module);

      // Styles first, then scripts — sequentially, so a module's own scripts
      // (getScripts) are present before start() uses them.
      var styles = module.getStyles() || [];
      var scripts = module.getScripts() || [];
      var chain = Promise.resolve();
      styles.forEach(function (href) {
        chain = chain.then(function () { return loadStyle(resolveAsset(href)); });
      });
      scripts.forEach(function (src) {
        chain = chain.then(function () {
          return loadScript(resolveAsset(src)).catch(function (e) { Log.error(e.message); });
        });
      });

      return chain.then(function () {
        // Build the DOM skeleton BEFORE start(), matching MagicMirror: modules
        // frequently call updateDom()/getElementById(identifier) during start().
        var container = ensureRegion(root, spec.position);
        var wrapper = document.createElement("div");
        wrapper.className = "module " + classes;
        wrapper.id = identifier;
        var header = document.createElement("header");
        header.className = "module-header";
        var content = document.createElement("div");
        content.className = "module-content";
        wrapper.appendChild(header);
        wrapper.appendChild(content);
        container.appendChild(wrapper);

        try { module.start(); } catch (e) { Log.error(name + ".start() threw:", e); }
        module.updateDom(0);
        return module;
      });
    });
  }

  // --- Schedule fixture notifications --------------------------------------
  function scheduleNotifications(module, notifications) {
    (notifications || []).forEach(function (n) {
      var delay = Math.max(0, n.at || 0);
      setTimeout(function () {
        var kind = n.kind || "notification";
        try {
          if (kind === "socket") {
            module.socketNotificationReceived(n.notification, n.payload);
          } else {
            module.notificationReceived(n.notification, n.payload, n.sender || { name: "HARNESS" });
          }
        } catch (e) {
          Log.error("scheduled " + kind + " " + n.notification + " threw:", e);
        }
      }, delay);
    });
  }

  // --- Boot -----------------------------------------------------------------
  function boot() {
    var params = new URLSearchParams(location.search);
    var configUrl = params.get("config") || "demo.config.json";

    loadJSON(configUrl).then(function (cfg) {
      if (cfg.viewport && cfg.viewport.width && cfg.viewport.height) {
        document.documentElement.style.setProperty("--mirror-w", cfg.viewport.width + "px");
        document.documentElement.style.setProperty("--mirror-h", cfg.viewport.height + "px");
        document.body.classList.add("fixed-viewport");
      }

      var root = document.getElementById("mirror") || document.body;
      var specs = Array.isArray(cfg.modules) ? cfg.modules : [cfg];
      var mounted = [];

      var chain = Promise.resolve();
      specs.forEach(function (spec, i) {
        chain = chain.then(function () {
          return mountModule(root, spec, i)
            .then(function (m) { mounted[i] = m; })
            .catch(function (e) { Log.error(e.message); mounted[i] = null; });
        });
      });

      return chain.then(function () {
        // Fire the MagicMirror boot lifecycle notifications, then start the
        // scripted fixture traffic.
        setTimeout(function () {
          broadcast("ALL_MODULES_STARTED", mounted.filter(Boolean), null);
          broadcast("MODULE_DOM_CREATED", undefined, null);
          broadcast("DOM_OBJECTS_CREATED", undefined, null);
          specs.forEach(function (spec, i) {
            if (mounted[i]) scheduleNotifications(mounted[i], spec.notifications);
          });
        }, 0);
      });
    }).catch(function (e) {
      Log.error(e.message);
      document.body.innerHTML =
        '<div class="harness-error">Harness could not load "' + configUrl + '":<br>' + e.message + "</div>";
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
