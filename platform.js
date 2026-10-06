/* Platform layer: Yandex Games SDK, VK Mini Apps (vk-bridge) or plain browser (local test).
   Game code only talks to window.P.  */
(function () {
  var P = {
    name: 'local', lang: 'ru', ready: false, muted: false,
    _ysdk: null, _player: null, _vk: null, _tg: null, _lastAdv: 0, _adOpen: false, canShare: false, startParam: '',
    onPause: function () {}, onResume: function () {}
  };
  var SAVE_KEY = (window.GAME_ID || 'game') + '_save';

  function detectLang() {
    var l = (navigator.language || 'ru').slice(0, 2).toLowerCase();
    return ['ru', 'uk', 'be', 'kk', 'uz'].indexOf(l) >= 0 ? 'ru' : 'en';
  }

  P.init = function () {
    P.lang = detectLang();
    // pause when the tab is hidden (platform requirement)
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) { P.onPause('hidden'); } else if (!P._adOpen) { P.onResume('hidden'); }
    });
    var tg = window.Telegram && window.Telegram.WebApp;
    if (tg && tg.initData) {
      P.name = 'telegram'; P._tg = tg; P.canShare = true;
      try { tg.ready(); tg.expand(); } catch (e) {}
      try { if (tg.disableVerticalSwipes) tg.disableVerticalSwipes(); } catch (e) {}
      try { tg.setHeaderColor('#0b0f2a'); tg.setBackgroundColor('#0b0f2a'); } catch (e) {}
      try {
        var lc = (tg.initDataUnsafe && tg.initDataUnsafe.user && tg.initDataUnsafe.user.language_code) || '';
        if (lc) P.lang = ['ru', 'uk', 'be', 'kk', 'uz'].indexOf(lc.slice(0, 2)) >= 0 ? 'ru' : 'en';
        P.startParam = (tg.initDataUnsafe && tg.initDataUnsafe.start_param) || '';
      } catch (e) {}
      try { tg.onEvent('deactivated', function () { P.onPause('hidden'); }); tg.onEvent('activated', function () { if (!P._adOpen) P.onResume('hidden'); }); } catch (e) {}
      return Promise.resolve();
    }
    if (window.YaGames) {
      return window.YaGames.init().then(function (ysdk) {
        P.name = 'yandex'; P._ysdk = ysdk;
        try { P.lang = ysdk.environment.i18n.lang === 'ru' ? 'ru' : (['uk', 'be', 'kk', 'uz'].indexOf(ysdk.environment.i18n.lang) >= 0 ? 'ru' : 'en'); } catch (e) {}
        return ysdk.getPlayer({ scopes: false }).then(function (pl) { P._player = pl; }).catch(function () {});
      }).catch(function () { P.name = 'local'; });
    }
    if (window.vkBridge) {
      P.name = 'vk'; P._vk = window.vkBridge;
      return P._vk.send('VKWebAppInit').then(function () {
        return P._vk.send('VKWebAppGetLaunchParams').then(function (lp) {
          if (lp && lp.vk_language) P.lang = lp.vk_language === 'ru' || lp.vk_language === 'uk' || lp.vk_language === 'be' ? 'ru' : 'en';
        }).catch(function () {});
      }).catch(function () {});
    }
    return Promise.resolve();
  };

  // call once the first screen is interactive
  P.gameReady = function () {
    if (P.ready) return; P.ready = true;
    try { if (P._ysdk) P._ysdk.features.LoadingAPI.ready(); } catch (e) {}
  };
  P.gameplayStart = function () { try { if (P._ysdk) P._ysdk.features.GameplayAPI.start(); } catch (e) {} };
  P.gameplayStop = function () { try { if (P._ysdk) P._ysdk.features.GameplayAPI.stop(); } catch (e) {} };

  // Adsgram (Telegram): block ids come from window.TG_CFG in index.html
  var CFG = window.TG_CFG || {};
  var adCtl = {};
  function adsgram(kind) {
    var id = kind === 'reward' ? CFG.rewardBlockId : CFG.interBlockId;
    if (!id || !window.Adsgram) return null;
    if (!adCtl[kind]) { try { adCtl[kind] = window.Adsgram.init({ blockId: id, debug: !!CFG.debug }); } catch (e) { return null; } }
    return adCtl[kind];
  }
  function adOpen() { P._adOpen = true; P.onPause('ad'); }
  function adClose() { P._adOpen = false; P.onResume('ad'); }

  // fullscreen ad between rounds; platform enforces frequency, we also keep >= 60s gap
  P.showInterstitial = function () {
    return new Promise(function (resolve) {
      var now = Date.now();
      if (now - P._lastAdv < 60000) return resolve(false);
      if (P._ysdk) {
        P._ysdk.adv.showFullscreenAdv({ callbacks: {
          onOpen: function () { P._lastAdv = Date.now(); adOpen(); },
          onClose: function (shown) { adClose(); resolve(!!shown); },
          onError: function () { adClose(); resolve(false); }
        } });
      } else if (P._tg) {
        var ci = adsgram('inter');
        if (!ci) return resolve(false);
        adOpen();
        ci.show().then(function () { P._lastAdv = Date.now(); adClose(); resolve(true); })
          .catch(function () { P._lastAdv = Date.now(); adClose(); resolve(false); });
      } else if (P._vk) {
        adOpen();
        P._vk.send('VKWebAppShowNativeAds', { ad_format: 'interstitial' })
          .then(function (r) { P._lastAdv = Date.now(); adClose(); resolve(!!(r && r.result)); })
          .catch(function () { adClose(); resolve(false); });
      } else { resolve(false); }
    });
  };

  // rewarded video: resolves true only if the reward was earned
  P.showRewarded = function () {
    return new Promise(function (resolve) {
      if (P._ysdk) {
        var got = false;
        P._ysdk.adv.showRewardedVideo({ callbacks: {
          onOpen: adOpen,
          onRewarded: function () { got = true; },
          onClose: function () { adClose(); resolve(got); },
          onError: function () { adClose(); resolve(false); }
        } });
      } else if (P._tg) {
        var cr = adsgram('reward');
        if (!cr) {
          // Adsgram ещё не подключён: даём награду без рекламы, чтобы игра работала до модерации
          adOpen(); setTimeout(function () { adClose(); resolve(true); }, 400); return;
        }
        adOpen();
        cr.show().then(function () { adClose(); resolve(true); })
          .catch(function () { adClose(); resolve(false); });
      } else if (P._vk) {
        adOpen();
        P._vk.send('VKWebAppShowNativeAds', { ad_format: 'reward' })
          .then(function (r) { adClose(); resolve(!!(r && r.result)); })
          .catch(function () { adClose(); resolve(false); });
      } else {
        // local test: pretend the ad was watched
        adOpen(); setTimeout(function () { adClose(); resolve(true); }, 600);
      }
    });
  };

  P.load = function () {
    var local = null;
    try { local = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null'); } catch (e) {}
    if (P._tg && P._tg.CloudStorage) {
      return new Promise(function (res) {
        try {
          P._tg.CloudStorage.getItem(SAVE_KEY, function (err, v) {
            if (err || !v) return res(local || {});
            try { res(JSON.parse(v)); } catch (e) { res(local || {}); }
          });
        } catch (e) { res(local || {}); }
      });
    }
    if (P._player) {
      return P._player.getData([SAVE_KEY]).then(function (d) { return (d && d[SAVE_KEY]) || local || {}; }).catch(function () { return local || {}; });
    }
    if (P._vk) {
      return P._vk.send('VKWebAppStorageGet', { keys: [SAVE_KEY] }).then(function (r) {
        var v = r && r.keys && r.keys[0] && r.keys[0].value;
        return v ? JSON.parse(v) : (local || {});
      }).catch(function () { return local || {}; });
    }
    return Promise.resolve(local || {});
  };

  var saveTimer = null;
  P.save = function (obj) {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(obj)); } catch (e) {}
    clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
      var o = {}; o[SAVE_KEY] = obj;
      if (P._tg && P._tg.CloudStorage) { try { P._tg.CloudStorage.setItem(SAVE_KEY, JSON.stringify(obj).slice(0, 4000), function () {}); } catch (e) {} }
      else if (P._player) P._player.setData(o, false).catch(function () {});
      else if (P._vk) P._vk.send('VKWebAppStorageSet', { key: SAVE_KEY, value: JSON.stringify(obj) }).catch(function () {});
    }, 800);
  };

  // Telegram: позвать друга (ссылка на мини-апп с реферальным параметром)
  P.share = function (text) {
    if (!P._tg) return false;
    var uid = (P._tg.initDataUnsafe && P._tg.initDataUnsafe.user && P._tg.initDataUnsafe.user.id) || '';
    var link = 'https://t.me/' + (CFG.botUsername || 'neonhop_game_bot') + '?startapp=ref_' + uid;
    var url = 'https://t.me/share/url?url=' + encodeURIComponent(link) + '&text=' + encodeURIComponent(text || '');
    try { P._tg.openTelegramLink(url); return true; } catch (e) { return false; }
  };

  P.t = function (dict) { return dict[P.lang] || dict.en; };
  window.P = P;
})();

/* Tiny synth sound: no audio files needed */
(function () {
  var ctx = null, master = null;
  var S = { muted: false };
  function ensure() {
    if (!ctx) {
      try { ctx = new (window.AudioContext || window.webkitAudioContext)(); master = ctx.createGain(); master.gain.value = 0.25; master.connect(ctx.destination); } catch (e) {}
    }
    if (ctx && ctx.state === 'suspended') ctx.resume();
  }
  S.beep = function (freq, dur, type, slide) {
    if (S.muted || (window.P && P._adOpen) || document.hidden) return;
    ensure(); if (!ctx) return;
    var o = ctx.createOscillator(), g = ctx.createGain(), t = ctx.currentTime;
    o.type = type || 'square'; o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(slide, t + dur);
    g.gain.setValueAtTime(0.5, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(master); o.start(t); o.stop(t + dur);
  };
  S.suspend = function () { if (ctx && ctx.state === 'running') ctx.suspend(); };
  S.resume = function () { if (ctx && ctx.state === 'suspended' && !S.muted) ctx.resume(); };
  window.SFX = S;
})();
