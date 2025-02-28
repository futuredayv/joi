'use strict';

const Hoek = require('@hapi/hoek');

const About = require('../about');
const Common = require('../common');
const Errors = require('../errors');
const Ref = require('../ref');
const Validator = require('../validator');
const Values = require('../values');

let Alternatives = null;                            // Delay-loaded to prevent circular dependencies
let Cast = null;
let Schemas = null;


const internals = {
    keysToRestore: [                                // Properties to copy over when rebasing a concat source
        '_description',
        '_examples',
        '_flags',
        '_inner',
        '_invalids',
        '_meta',
        '_notes',
        '_preferences',
        '_refs',
        '_ruleset',
        '_tags',
        '_tests',
        '_uniqueRules',
        '_unit',
        '_valids'
    ]
};


module.exports = internals.Any = class {

    constructor() {

        Cast = Cast || require('../cast');

        this[Common.symbols.any] = true;

        this._type = 'any';
        this._preferences = null;
        this._refs = new Ref.Manager();

        this._valids = new Values();
        this._invalids = new Values();

        this._tests = [];
        this._uniqueRules = new Map();
        this._ruleset = null;                       // null: use last, false: error, number: start position

        this._flags = {
            /*
             allowOnly: false,
             allowUnknown: undefined,
             default: undefined,
             empty: undefined,
             encoding: undefined,
             failover: undefined,
             format: undefined
             func: false,
             insensitive: false,
             label: undefined,
             lazy: undefined,
             once: true,
             presence: 'optional',                  // optional, required, forbidden, ignore
             raw: false,
             single: undefined,
             sparse: false,
             strip: undefined,
             timestamp: undefined,
             truncate: undefined,
             unsafe: false
             */
        };

        this._description = null;
        this._unit = null;
        this._notes = [];
        this._tags = [];
        this._examples = [];
        this._meta = [];

        this._inner = {};                           // Hash of arrays of immutable objects
    }

    // About

    get schemaType() {

        return this._type;
    }

    describe() {

        return About.describe(this);
    }

    // Rules

    allow(...values) {

        Common.verifyFlat(values, 'allow');

        const obj = this.clone();
        for (const value of values) {
            Hoek.assert(value !== undefined, 'Cannot call allow/valid/invalid with undefined');
            obj._invalids.remove(value);
            obj._valids.add(value, obj._refs);
        }

        return obj;
    }

    default(value, description) {

        return this._default('default', value, description);
    }

    description(desc) {

        Hoek.assert(desc && typeof desc === 'string', 'Description must be a non-empty string');

        const obj = this.clone();
        obj._description = desc;
        return obj;
    }

    empty(schema) {

        return this._flag('empty', schema !== undefined ? Cast.schema(this._currentJoi, schema) : undefined);
    }

    error(err) {

        Hoek.assert(err, 'Missing error');
        Hoek.assert(err instanceof Error || typeof err === 'function', 'Must provide a valid Error object or a function');

        return this._flag('error', err);
    }

    example(...examples) {

        Hoek.assert(examples.length, 'Missing examples');

        const obj = this.clone();
        obj._examples = examples;
        return obj;
    }

    failover(value, description) {

        return this._default('failover', value, description);
    }

    forbidden() {

        return this._flag('presence', 'forbidden');
    }

    invalid(...values) {

        Common.verifyFlat(values, 'invalid');

        const obj = this.clone();
        for (const value of values) {
            Hoek.assert(value !== undefined, 'Cannot call allow/valid/invalid with undefined');
            obj._valids.remove(value);
            obj._invalids.add(value, obj._refs);
        }

        return obj;
    }

    keep() {

        return this.rule({ keep: true });
    }

    label(name) {

        Hoek.assert(name && typeof name === 'string', 'Label name must be a non-empty string');

        return this._flag('label', name);
    }

    message(message) {

        return this.rule({ message });
    }

    meta(meta) {

        Hoek.assert(meta !== undefined, 'Meta cannot be undefined');

        const obj = this.clone();
        obj._meta = obj._meta.concat(meta);
        return obj;
    }

    notes(notes) {

        Hoek.assert(notes && (typeof notes === 'string' || Array.isArray(notes)), 'Notes must be a non-empty string or array');

        const obj = this.clone();
        obj._notes = obj._notes.concat(notes);
        return obj;
    }

    optional() {

        return this._flag('presence', 'optional');
    }

    prefs(prefs) {

        Hoek.assert(!prefs.context, 'Cannot override context');
        this.checkPreferences(prefs);

        const obj = this.clone();
        obj._preferences = Common.preferences(obj._preferences, prefs);
        return obj;
    }

    raw(isRaw) {

        return this._flag('raw', isRaw === undefined ? true : isRaw);
    }

    required() {

        return this._flag('presence', 'required');
    }

    rule(options) {

        Common.assertOptions(options, ['keep', 'message']);

        Hoek.assert(this._ruleset !== false, 'Cannot apply rules to empty ruleset');
        const start = this._ruleset === null ? this._tests.length - 1 : this._ruleset;
        Hoek.assert(start >= 0 && start < this._tests.length, 'Cannot apply rules to empty ruleset');

        options = Errors.messages(options);

        const obj = this.clone();

        for (let i = start; i < obj._tests.length; ++i) {
            obj._tests[i] = Object.assign({}, obj._tests[i], options);
        }

        obj._ruleset = false;
        return obj;
    }

    get ruleset() {

        Hoek.assert(!this._inRuleset(), 'Cannot start a new ruleset without closing the previous one');

        const obj = this.clone();
        obj._ruleset = obj._tests.length;
        return obj;
    }

    get $() {

        return this.ruleset;
    }

    strict(enabled) {

        const obj = this.clone();

        const convert = enabled === undefined ? false : !enabled;
        obj._preferences = Common.preferences(obj._preferences, { convert });
        return obj;
    }

    strip() {

        return this._flag('strip', true);
    }

    tags(tags) {

        Hoek.assert(tags && (typeof tags === 'string' || Array.isArray(tags)), 'Tags must be a non-empty string or array');

        const obj = this.clone();
        obj._tags = obj._tags.concat(tags);
        return obj;
    }

    unit(name) {

        Hoek.assert(name && typeof name === 'string', 'Unit name must be a non-empty string');

        const obj = this.clone();
        obj._unit = name;
        return obj;
    }

    valid(...values) {

        return this.allow(...values)._flag('allowOnly', true, { clone: false });
    }

    when(condition, options) {

        Alternatives = Alternatives || require('./alternatives');

        if (Array.isArray(options)) {
            options = { switch: options };
        }

        Common.assertOptions(options, ['is', 'then', 'otherwise', 'switch']);

        const process = (settings) => {

            const item = {
                is: settings.is,
                then: settings.then && this.concat(Cast.schema(this._currentJoi, settings.then))
            };

            if (settings.otherwise) {
                item.otherwise = this.concat(Cast.schema(this._currentJoi, settings.otherwise));
            }

            return item;
        };

        const alternativeOptions = process(options);

        if (options.switch) {
            Hoek.assert(Array.isArray(options.switch), '"switch" must be an array');
            alternativeOptions.switch = options.switch.map(process);
        }

        const obj = Alternatives.when(condition, alternativeOptions);
        obj._flag('presence', 'ignore', { clone: false });
        obj._baseType = this;
        return obj;
    }

    // Helpers

    applyFunctionToChildren(children, fn, args = [], root) {

        children = [].concat(children);

        if (children.length !== 1 || children[0] !== '') {
            root = root ? (root + '.') : '';

            const extraChildren = (children[0] === '' ? children.slice(1) : children).map((child) => {

                return root + child;
            });

            throw new Error('unknown key(s) ' + extraChildren.join(', '));
        }

        return this[fn](...args);
    }

    checkPreferences(prefs) {

        Schemas = Schemas || require('../schemas');

        const result = Schemas.preferences.validate(prefs);

        if (result.error) {
            throw new Error(result.error.details[0].message);
        }
    }

    clone() {

        const obj = Object.create(Object.getPrototypeOf(this));

        obj[Common.symbols.any] = true;

        obj._currentJoi = this._currentJoi;
        obj._type = this._type;
        obj._preferences = this._preferences;
        obj._baseType = this._baseType;
        obj._valids = this._valids.slice();
        obj._invalids = this._invalids.slice();
        obj._tests = this._tests.slice();
        obj._uniqueRules = Hoek.clone(this._uniqueRules, { shallow: true });
        obj._ruleset = this._ruleset;
        obj._refs = this._refs.clone();
        obj._flags = Hoek.clone(this._flags);

        obj._description = this._description;
        obj._unit = this._unit;
        obj._notes = this._notes.slice();
        obj._tags = this._tags.slice();
        obj._examples = this._examples.slice();
        obj._meta = this._meta.slice();

        obj._inner = {};
        for (const key in this._inner) {
            obj._inner[key] = this._inner[key] ? this._inner[key].slice() : null;
        }

        return obj;
    }

    concat(source) {

        Hoek.assert(source instanceof internals.Any, 'Invalid schema object');
        Hoek.assert(this._type === 'any' || source._type === 'any' || source._type === this._type, 'Cannot merge type', this._type, 'with another type:', source._type);

        let obj = this.clone();

        if (this._type === 'any' &&
            source._type !== 'any') {

            // Reset values as if we were "this"

            const tmpObj = source.clone();
            for (const key of internals.keysToRestore) {
                tmpObj[key] = obj[key];
            }

            obj = tmpObj;
        }

        obj._preferences = obj._preferences ? Common.preferences(obj._preferences, source._preferences) : source._preferences;
        obj._valids.merge(source._valids, source._invalids);
        obj._invalids.merge(source._invalids, source._valids);
        obj._refs.register(source, Ref.toSibling);

        // Remove unique rules present in source

        for (const name of source._uniqueRules.keys()) {
            if (obj._uniqueRules.has(name)) {
                obj._tests = obj._tests.filter((target) => target.name !== name);
                obj._uniqueRules.delete(name);
            }
        }

        // Adjust ruleset

        if (source._ruleset !== null) {
            Hoek.assert(!obj._inRuleset(), 'Cannot concatenate onto a schema with open ruleset');
            obj._ruleset = source._ruleset === false ? false : source._ruleset + obj._tests.length;
        }

        // Combine tests

        for (const test of source._tests) {
            if (test.rule &&
                !test.rule.multi) {

                obj._uniqueRules.set(test.name, test.rule._options);
            }

            obj._tests.push(test);
        }

        if (obj._flags.empty &&
            source._flags.empty) {

            obj._flags.empty = obj._flags.empty.concat(source._flags.empty);
            const flags = Object.assign({}, source._flags);
            delete flags.empty;
            Hoek.merge(obj._flags, flags);
        }
        else if (source._flags.empty) {
            obj._flags.empty = source._flags.empty;
            const flags = Object.assign({}, source._flags);
            delete flags.empty;
            Hoek.merge(obj._flags, flags);
        }
        else {
            Hoek.merge(obj._flags, source._flags);
        }

        obj._description = source._description || obj._description;
        obj._unit = source._unit || obj._unit;
        obj._notes.push(...source._notes);
        obj._tags.push(...source._tags);
        obj._examples.push(...source._examples);
        obj._meta.push(...source._meta);

        for (const key in source._inner) {
            const inners = source._inner[key];
            if (!inners) {
                continue;
            }

            const targets = obj._inner[key];
            if (!targets) {
                obj._inner[key] = inners.slice();
                continue;
            }

            if (obj._type !== 'object' ||
                key !== 'children') {

                obj._inner[key] = obj._inner[key].concat(inners);
                continue;
            }

            // Special handling for object children

            const keys = {};
            for (let i = 0; i < targets.length; ++i) {
                keys[targets[i].key] = i;
            }

            for (const inner of inners) {
                const sourceKey = inner.key;
                if (keys[sourceKey] >= 0) {
                    targets[keys[sourceKey]] = {
                        key: sourceKey,
                        schema: targets[keys[sourceKey]].schema.concat(inner.schema)
                    };
                }
                else {
                    targets.push(inner);
                }
            }
        }

        return obj;
    }

    createError(code, value, local, state, prefs) {

        return new Errors.Report(code, value, local, state, prefs);
    }

    validate(value, options, callback) {

        if (typeof options === 'function') {
            return Validator.process(value, this, null, options);
        }

        return Validator.process(value, this, options, callback);
    }

    // Internals

    _default(flag, value, description) {

        if (typeof value === 'function') {
            if (!value.description &&
                description) {

                value.description = description;
            }

            if (!this._flags.func) {
                Hoek.assert(value.description && typeof value.description === 'string', `description must be provided when ${flag} value is a function`);
            }
        }

        if (value === undefined) {
            value = Common.symbols.deepDefault;
        }

        const obj = this._flag(flag, value);
        obj._refs.register(value);
        return obj;
    }

    _flag(flag, value, options = {}) {

        Hoek.assert(!this._inRuleset(), 'Cannot set flag inside a ruleset');

        let obj = this;                                         // eslint-disable-line consistent-this

        const apply = (f, v) => {

            if (Hoek.deepEqual(v, this._flags[f])) {
                return;
            }

            if (obj === this &&                                 // Clone once
                options.clone !== false) {                      // Defaults to true

                obj = this.clone();
            }

            if (v !== undefined) {
                obj._flags[f] = v;
            }
            else {
                delete obj._flags[f];
            }
        };

        if (Array.isArray(flag)) {
            for (const set of flag) {
                apply(set.flag, set.value);
            }
        }
        else {
            apply(flag, value);
        }

        obj._ruleset = false;
        return obj;
    }

    _getLabel(def) {

        return this._flags.label || def;
    }

    _init() {

        return this;
    }

    _inRuleset() {

        return this._ruleset !== null && this._ruleset !== false;
    }

    _match(value, state, prefs, reference) {

        return !Validator.validate(value, this, state, prefs, reference).errors;
    }

    _rule(name, options = {}) {

        if (!options.multi &&
            this._uniqueRules.has(name) &&
            Hoek.deepEqual(options, this._uniqueRules.get(name))) {

            return this;
        }

        const obj = this.clone();

        const rule = {
            rule: name,
            alias: name,
            resolve: [],
            ...options,         // args, refs, multi, convert, ...rule-specific
            _options: options   // The original options
        };

        if (options.refs) {
            for (const key in options.args) {
                const resolver = options.refs[key];
                if (resolver) {
                    let arg = options.args[key];
                    if (Ref.isRef(arg)) {
                        rule.resolve.push(key);
                        obj._refs.register(arg);
                    }
                    else {
                        if (resolver.normalize) {
                            arg = resolver.normalize(arg);
                            options.args[key] = arg;
                        }

                        Hoek.assert(resolver.assert(arg), resolver.message);
                    }
                }
            }
        }

        if (!options.multi) {
            obj._ruleRemove(name, { clone: false });
            obj._uniqueRules.set(name, rule._options);
        }

        if (obj._ruleset === false) {
            obj._ruleset = null;
        }

        obj._tests.push({ rule, name, arg: options.args });

        return obj;
    }

    _ruleRemove(name, options = {}) {

        if (!this._uniqueRules.has(name)) {
            return this;
        }

        const obj = options.clone !== false ? this.clone() : this;

        obj._uniqueRules.delete(name);

        const filtered = [];
        for (let i = 0; i < obj._tests.length; ++i) {
            const test = obj._tests[i];
            if (test.name === name &&
                !test.keep) {

                if (obj._inRuleset() &&
                    i < obj._ruleset) {

                    --obj._ruleset;
                }

                continue;
            }

            filtered.push(test);
        }

        obj._tests = filtered;
        return obj;
    }

    _state(key, path, ancestors = [], options = {}) {

        return { key, path, ancestors, parent: ancestors[0], flags: options.flags !== false ? this._flags : {} };
    }

    _validate(value, state, prefs) {

        return Validator.validate(value, this, { ...state, flags: this._flags }, prefs);
    }

    _test(name, arg, func, options) {

        const obj = this.clone();

        if (obj._ruleset === false) {
            obj._ruleset = null;
        }

        obj._tests.push({ func, name, arg, options });

        return obj;
    }
};


internals.Any.prototype.isImmutable = true;     // Prevents Hoek from deep cloning schema objects


// Aliases

internals.Any.prototype.disallow = internals.Any.prototype.invalid;
internals.Any.prototype.equal = internals.Any.prototype.valid;
internals.Any.prototype.exist = internals.Any.prototype.required;
internals.Any.prototype.not = internals.Any.prototype.invalid;
internals.Any.prototype.only = internals.Any.prototype.valid;
internals.Any.prototype.options = internals.Any.prototype.prefs;
internals.Any.prototype.preferences = internals.Any.prototype.prefs;
