class HeybikeCommon {
    constructor() {
        this._events = new Map();
        this.mobile = this.ref(false);
        this.width = this.ref(0);
        this._init();
    }

    _getCurrentNode(event, elem) {
        if (elem) {
            return elem;
        }
        let node = document;
        switch (event) {
            case "resize":
            case "load":
                node = window;
                break;
            case "click":
                node = document.body;
                break;
        }
        return node;
    }

    _init() {
        this._winSize();
        const loadCb = () => {
            this._loaded = true;
            this.off('load', loadCb);
        }
        this.on("load", loadCb);
        const domCb = () => {
            this._domLoaded = true;
            this._winSize();
            const elems = Array.from(document.body.querySelectorAll('.lazy-import'));
            elems.forEach(elem => elem.getAttribute('data-lazy-import').split(',').forEach(url => this.import(url.trim())));
            this.off('DOMContentLoaded', domCb);
        }
        this.on("DOMContentLoaded", domCb);
        this.on('resize');
    }

    _winSize() {
        this.screenWidth = window.innerWidth;
        this.screenHeight = window.innerHeight;
        this.isMobile = /android|iphone|ipad|ipod|micromessenger/gi.test(navigator.userAgent.toLocaleLowerCase()) || this.screenWidth <= 1023;
        this.mobile.value = this.isMobile;
        this.width.value = this.screenWidth;
    }

    on(event, fn, node) {
        node = this._getCurrentNode(event, node);
        if (!this._events.has(event)) {
            this._events.set(event, [{node, key: Date.now() + '', fns: []}]);
        }

        let info = this._events.get(event).find(item => item.node === node);

        if (!info) {
            info = {node, key: Date.now() + '', fns: []};
            this._events.get(event).push(info);
        }

        info.fns.push(fn);

        if (info.fns.length === 1) {
            if (event === "resize") {
                if (node === window) {
                    info.listener = ev => {
                        this.debounce(() => {
                            this._winSize();
                            info.fns.forEach(fn => {
                                fn && fn(ev);
                            });
                        }, 100, info.key);
                    }
                    node.addEventListener("resize", info.listener);
                } else {
                    const key = '__RESIZE__';
                    if (!this._events.has(key)) {
                        this._events.set(key, new ResizeObserver((entries) => {
                            this.debounce(() => {
                                for (let entry of entries) {
                                    const info = this._events.get(event).find(item => item.node === entry.target);
                                    info && info.fns.forEach(fn => {
                                        fn && fn(entry);
                                    });
                                    !info && this._events.get(key).unobserve(entry.target);
                                }
                            }, 100, `${key}DEB__`);
                        }));
                    }
                    this._events.get(key).observe(node);
                }
            } else if (event === "scroll") {
                info.listener = event => {
                    const isDoc = info.node === document;
                    const left = isDoc ? (window.scrollX || document.documentElement.scrollLeft) : info.node.scrollLeft;
                    const top = isDoc ? (window.scrollY || document.documentElement.scrollTop) : info.node.scrollTop;
                    info.fns.forEach(fn => {
                        fn && fn({
                            left,
                            top,
                            event
                        });
                    });
                }
                node.addEventListener("scroll", info.listener);
            } else {
                info.listener = ev => {
                    ev && info.fns.forEach(fn => {
                        fn && fn(ev);
                    });
                }
                switch (event) {
                    case "resize:mobile":
                        info.unwatch = this.watch(this.mobile, info.listener, {immediate: true});
                        break;
                    case "resize:width":
                        info.unwatch = this.watch(this.width, info.listener, {async: true});
                        break;
                    default:
                        node.addEventListener(event, info.listener);
                        break;
                }
            }
        }

        if ((this._domLoaded && event === "DOMContentLoaded") || (this._loaded && event === "load")) {
            fn && fn();
        }
    }

    ready(cb) {
        this.on('DOMContentLoaded', cb);
    }

    trigger(event, node, target) {
        node = this._getCurrentNode(event, node);
        if (!this._events.has(event)) {
            return false;
        }

        const info = this._events.get(event).find(item => item.node === node);
        info && info.fns.forEach(fn => fn && fn({target}));
    }

    off(event, fn, node) {
        if (!this._events.has(event)) {
            return false;
        }
        node = this._getCurrentNode(event, node);
        const list = this._events.get(event);
        const i = list.findIndex(item => item.node === node);
        if (i < 0) {
            return false;
        }
        const info = list[i];
        info.fns = info.fns.filter(cb => cb !== fn);
        if (info.fns.length === 0) {
            if (info.unwatch) {
                info.unwatch();
            } else {
                node.removeEventListener(event, info.listener);
            }
            list.splice(i, 1);
            if (list.length === i) {
                this._events.delete(event);
            } else {
                this._events.set(event, list);
            }
        }
        return true;
    }

    bind(key, fn, once) {
        if (!this._events.has(key)) {
            this._events.set(key, []);
        }
        return new Promise(resolve => {
            this._events.get(key).push({fn, resolve, once});
        });
    }

    unbind(key, fn) {
        if (this._events.has(key)) {
            this._events.set(key, this._events.get(key).filter(obj => obj.fn !== fn));
            if (this._events.get(key).length === 0) {
                this._events.delete(key);
            }
        }
    }

    emit(key, data) {
        return new Promise(resolve => {
            const list = this._events.get(key);
            if (list) {
                list.forEach(obj => {
                    obj.fn && obj.fn(data);
                    obj.resolve(data);
                    obj.once && this.unbind(key, obj.fn);
                });
                resolve(true);
            } else {
                resolve(false);
            }
        });
    }

    getNodeList(node) {
        const list = Array.prototype.slice.call(node.querySelectorAll("[node-name]"), 0);
        const nodeList = {};

        list.forEach(function (el) {
            const name = el.getAttribute("node-name");
            if (name in nodeList) {
                nodeList[name] = [].concat(nodeList[name], el);
            } else {
                nodeList[name] = el;
            }
        });

        return nodeList;
    }

    getOffset(el) {
        let body = document.body;
        el = el || body;
        let box = el.getBoundingClientRect();
        let clientTop = el.clientTop || body.clientTop || 0;
        let clientLeft = el.clientLeft || body.clientLeft || 0;
        let scrollTop = window.scrollY || el.scrollTop;
        let scrollLeft = window.scrollX || el.scrollLeft;
        return {
            top: box.top + scrollTop - clientTop,
            left: box.left + scrollLeft - clientLeft,
            scrollTop,
            scrollLeft
        };
    }

    ref(value) {
        return {
            value: typeof value === "undefined" ? null : value
        }
    }

    watch(data, cb, {async = false, immediate = false, delay = 30} = {}) {
        let oldValue = data.value;
        let timer = null;
        if (immediate) {
            cb?.(oldValue, undefined);
        }

        Object.defineProperty(data, "value", {
            get() {
                return oldValue;
            },
            set(newValue) {
                if (newValue === oldValue) return;

                const prevValue = oldValue;
                oldValue = newValue;

                const executeCallback = () => {
                    cb?.(newValue, prevValue);
                };

                if (async) {
                    clearTimeout(timer);
                    timer = setTimeout(executeCallback, delay);
                } else {
                    executeCallback();
                }
            }
        });

        return () => {
            clearTimeout(timer);
            Object.defineProperty(data, "value", {
                value: oldValue,
                writable: true,
                configurable: true,
                enumerable: true
            });
        };
    }

    import(url) {
        if (this._events.has(url)) {
            return false;
        }
        const loadScript = src => {
            const script = document.createElement("script");
            script.src = src;
            script.defer = true;
            script.onerror = () => console.warn("Failed to load script:", src);
            document.head.appendChild(script);
        };
        const loadCss = url => {
            const link = document.createElement("link");
            link.href = url;
            link.media = 'print';
            link.onload = () => link.media = 'all';
            link.rel = 'stylesheet';
            document.head.appendChild(link);
        };
        if (url.includes('.css')) {
            loadCss(url);
        } else {
            loadScript(url)
        }
        this._events.set(url, true);
    }

    debounce(fn, wait, key = '_timer') {
        clearTimeout(this._events.get(key));
        this._events.set(key, setTimeout(() => {
            fn && fn();
        }, wait || 100));
        return () => clearTimeout(this._events.get(key));
    }

    load({type}, fn) {
        if (!this._events.has(type)) {
            this._events.set(type, [fn]);
            this.bind(`${type}.LOADED`, null, true).then(vue => {
                this._events.set(`${type}.DATA`, vue);
                this._events.get(type).forEach(call => {
                    call && call(vue);
                }, true);
            });
            switch (type) {
                case "TNS":
                    this.import(`{{ 'tiny-slider.js' | asset_url }}`);
                    break;
                case "LIGHTBOX":
                    this.import(`{{ 'photoswipe.lightbox.min.js' | asset_url }}`);
                    break;
            }

        } else {
            if (this._events.has(`${type}.DATA`)) {
                fn && fn(this._events.get(`${type}.DATA`));
            } else {
                this._events.get(type).push(fn);
            }
        }
    }

    proxy(node, type, fn, nl = false) {
        const nodeList = nl ? this.getNodeList(node) : null;
        const types = [].concat(type);
        this.on('click', ev => {
            const target = ev.target;
            const key = target.dataset.proxy;
            if (types.includes(key)) {
                fn && fn({event: ev, elem: target, type: key, nodeList});
            } else {
                const node = target.closest('[data-proxy]');
                const key = node?.dataset.proxy;
                if (node && types.includes(key)) {
                    fn && fn({event: ev, elem: node, type: key, nodeList});
                }
            }
        }, node);
        return {
            nodeList,
            trigger: target => this.trigger('click', node, target)
        };
    }

    inView(node, fn, {root, margin, amount = "any"} = {}) {
        if ("undefined" === typeof IntersectionObserver) {
            let offset = null;
            this.on("DOMContentLoaded", () => (offset = this.getOffset(node)));
            const mt = parseInt(margin?.split(' ')?.[0] || 100);
            const onScroll = ({top, event}) => {
                if (offset && top + mt >= offset.top - this.screenHeight) {
                    off();
                    fn && fn(event);
                }
            }
            const off = () => this.off('scroll', onScroll, root);
            this.on('scroll', onScroll, root);
            return off;
        }
        const weakMap = new WeakMap(),
            obj = {any: 0, all: 1},
            observer = new IntersectionObserver((entries => {
                entries.forEach((entry => {
                    const elem = entry.target;
                    const cb = weakMap.get(elem);
                    if (entry.isIntersecting !== Boolean(cb)) {
                        if (entry.isIntersecting) {
                            const cb = fn(entry);
                            if ("function" === typeof cb) {
                                weakMap.set(elem, cb);
                            } else {
                                observer.unobserve(elem);
                                observer.disconnect();
                            }
                        } else if (cb) {
                            cb(entry);
                            weakMap.delete(elem);
                        }
                    }
                }))
            }), {root: root, rootMargin: margin, threshold: "number" == typeof amount ? amount : obj[amount]});
        observer.observe(node);
        return () => observer.disconnect();
    }

    tabSwitch({root, type = 'tab', panel = 'panel', selector = 'active', device, group, nodeList, cb}) {
        const scrollTo = target => {
            if (device !== 'all' && (device === 'mobile') !== this.isMobile) {
                return false;
            }
            const parent = target.parentNode;
            const targetRect = target.getBoundingClientRect();
            const parentRect = parent.getBoundingClientRect();
            if (targetRect.left < parentRect.left || targetRect.right > parentRect.right) {
                requestAnimationFrame(() => parent.scrollTo({
                    left: parent.scrollLeft + (targetRect.left < parentRect.left ? -1 : 1) * targetRect.width * 1.35,
                    behavior: 'smooth'
                }));
            }
        }
        const nl = nodeList;
        return this.proxy(root, type, ({elem, nodeList}) => {
            nodeList = nodeList || nl;
            const key = typeof group === 'string' ? group : 'group';
            const name = group ? elem.dataset[key] : null;
            const es = [].concat(nodeList[type] || []);
            const ps = [].concat(nodeList[panel] || []);
            const elems = name ? es.filter(n => n.dataset[key] === name) : es;
            const panels = name ? ps.filter(n => n.dataset[key] === name) : ps;
            const index = parseInt(elem.dataset.index || elems?.findIndex(e => e === elem), 10);
            if (elems[index]?.classList.contains(selector)) {
                cb && cb({elem, nodeList, index, self: true});
                return false;
            }

            elems.forEach((tab, i) => {
                const isActive = i === index;
                tab.classList.toggle(selector, isActive);
                panels[i]?.classList.toggle(selector, isActive);
            });

            device && scrollTo(elem);
            cb && cb({elem, nodeList, index, self: false});
        }, !nl);
    }

    money(amount, precision = 2, thousands = ',', decimal = '.') {
        const formatWithDelimiters = (number) => {
            if (typeof number === 'string' && number.includes(decimal)) {
                number = parseFloat(number) * 100;
            }
            if (isNaN(number) || number == null) {
                return 0;
            }
            number = (number / 100).toFixed(precision);
            let parts = number.split("."),
                dollarsAmount = parts[0].replace(/(\d)(?=(\d\d\d)+(?!\d))/g, "$1" + thousands),
                centsAmount = parts[1] ? decimal + parts[1] : "";
            return dollarsAmount + centsAmount;
        }
        return '{{ shop.money_format }}'.replace(/\{\{\s*(\w+)\s*\}\}/, formatWithDelimiters(amount, 2));
    }

    position(index) {
        const main = document.getElementById('main');
        let childList = [...main.childNodes].filter(item => item.nodeType === 1);
        if (childList[0] && !childList[0].id.includes('shopify-section-template')) {
            childList = [...childList[0].childNodes].filter(item => item.nodeType === 1);
        }
        let targetNode = childList[index - 1];
        if (targetNode) {
            window.scrollTo(0, this.getOffset(targetNode).top - 80);
        }
    }

    async clearCart(e) {
        return new Promise((t, n) => {
            fetch(window.Shopify.routes.root + 'cart/clear.js', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Accept: 'application/javascript'
                }
            }).then(e => e.json()).then(e => {
                e.status ? (alert(e.description), n(new Error(e.description))) : t();
            }).catch(e => {
                console.error(e), n(e);
            }).finally(() => {
                e && e();
            });
        });
    }

    async addToCart({items: i, button: b}, buyNow = false, cb) {
        let sectionsToBundle = ["variant-added"];
        document.documentElement.dispatchEvent(
            new CustomEvent("cart:prepare-bundled-sections", {
                bubbles: true,
                detail: {sections: sectionsToBundle}
            })
        );

        const config = {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Accept: 'application/javascript'
            },
            body: JSON.stringify({
                items: i,
                sections: sectionsToBundle,
                sections_url: window.location.pathname
            })
        };

        if (b) {
            if (b.hasAttribute('aria-disabled')) return;
            b.setAttribute('aria-disabled', 'true');
            b.setAttribute('aria-busy', 'true');
        }
        buyNow && await $heybike.clearCart();

        let isError = false;
        fetch(window.Shopify.routes.root + 'cart/add.js', config)
            .then(response => response.json())
            .then(async (parsedState) => {
                if (parsedState.status) {
                    isError = true;
                    alert(parsedState.description);
                    return false;
                }

                if (buyNow) {
                    return false;
                }
                const cartJson = await (
                    await fetch(`${Shopify.routes.root}cart.js`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            Accept: 'application/json'
                        }
                    })
                ).json();
                cartJson['sections'] = parsedState['sections'];
                document.dispatchEvent(new CustomEvent("variant:add", {
                    bubbles: true,
                    detail: {
                        items: parsedState.hasOwnProperty("items") ? parsedState["items"] : [parsedState],
                        cart: cartJson
                    }
                }));
                document.documentElement.dispatchEvent(new CustomEvent("cart:change", {
                    bubbles: true,
                    detail: {
                        baseEvent: "variant:add",
                        cart: cartJson
                    }
                }));

            }).catch(e => {
            console.log(e);
        }).finally(() => {
            if (b) {
                b.removeAttribute('aria-busy');
                b.removeAttribute('aria-disabled');
            }
            cb && cb();
            if (buyNow && !isError) {
                window.location = '/checkout/'
            }
        });
    }
}

const $heybike = new HeybikeCommon();