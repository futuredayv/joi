'use strict';

const Hoek = require('@hapi/hoek');

const Any = require('./types/any');
const Cast = require('./cast');
const Common = require('./common');
const Errors = require('./errors');
const Lazy = require('./types/lazy');
const Ref = require('./ref');
const Template = require('./template');
const Validator = require('./validator');


const internals = {
    alternatives: require('./types/alternatives'),
    array: require('./types/array'),
    boolean: require('./types/boolean'),
    binary: require('./types/binary'),
    date: require('./types/date'),
    func: require('./types/func'),
    number: require('./types/number'),
    object: require('./types/object'),
    string: require('./types/string'),
    symbol: require('./types/symbol')
};


internals.callWithDefaults = function (schema, args) {

    Hoek.assert(this, 'Must be invoked on a Joi instance.');

    if (this._defaults) {
        schema = this._defaults(schema);
    }

    schema._currentJoi = this;

    return schema._init(...args);
};


internals.root = function () {

    const any = new Any();

    const root = any.clone();
    Any.prototype._currentJoi = root;
    root._currentJoi = root;
    root._binds = new Set(['any', 'alternatives', 'alt', 'array', 'bool', 'boolean', 'binary', 'date', 'func', 'number', 'object', 'string', 'symbol', 'validate', 'describe', 'compile', 'assert', 'attempt', 'lazy', 'defaults', 'extend', 'allow', 'valid', 'only', 'equal', 'invalid', 'disallow', 'not', 'required', 'exist', 'optional', 'forbidden', 'strip', 'when', 'empty', 'default', 'failover']);

    root.any = function (...args) {

        Hoek.assert(args.length === 0, 'Joi.any() does not allow arguments.');

        return internals.callWithDefaults.call(this, any, args);
    };

    root.alternatives = root.alt = function (...args) {

        return internals.callWithDefaults.call(this, internals.alternatives, args);
    };

    root.array = function (...args) {

        Hoek.assert(args.length === 0, 'Joi.array() does not allow arguments.');

        return internals.callWithDefaults.call(this, internals.array, args);
    };

    root.boolean = root.bool = function (...args) {

        Hoek.assert(args.length === 0, 'Joi.boolean() does not allow arguments.');

        return internals.callWithDefaults.call(this, internals.boolean, args);
    };

    root.binary = function (...args) {

        Hoek.assert(args.length === 0, 'Joi.binary() does not allow arguments.');

        return internals.callWithDefaults.call(this, internals.binary, args);
    };

    root.date = function (...args) {

        Hoek.assert(args.length === 0, 'Joi.date() does not allow arguments.');

        return internals.callWithDefaults.call(this, internals.date, args);
    };

    root.func = function (...args) {

        Hoek.assert(args.length === 0, 'Joi.func() does not allow arguments.');

        return internals.callWithDefaults.call(this, internals.func, args);
    };

    root.number = function (...args) {

        Hoek.assert(args.length === 0, 'Joi.number() does not allow arguments.');

        return internals.callWithDefaults.call(this, internals.number, args);
    };

    root.object = function (...args) {

        return internals.callWithDefaults.call(this, internals.object, args);
    };

    root.string = function (...args) {

        Hoek.assert(args.length === 0, 'Joi.string() does not allow arguments.');

        return internals.callWithDefaults.call(this, internals.string, args);
    };

    root.symbol = function (...args) {

        Hoek.assert(args.length === 0, 'Joi.symbol() does not allow arguments.');

        return internals.callWithDefaults.call(this, internals.symbol, args);
    };

    root.template = function (...args) {

        return new Template(...args);
    };

    root.isTemplate = function (template) {

        return Template.isTemplate(template);
    };

    root.ref = function (...args) {

        return new Ref(...args);
    };

    root.isRef = function (ref) {

        return Ref.isRef(ref);
    };

    root.isSchema = function (schema) {

        return Common.isSchema(schema);
    };

    root.validate = function (value, ...args /*, [schema], [options], callback */) {

        const last = args[args.length - 1];
        const callback = typeof last === 'function' ? last : null;

        const count = args.length - (callback ? 1 : 0);
        if (count === 0) {
            return any.validate(value, callback);
        }

        const prefs = count === 2 ? args[1] : undefined;
        const schema = this.compile(args[0]);

        return Validator.process(value, schema, prefs, callback);
    };

    root.ValidationError = Errors.ValidationError;

    root.describe = function (...args) {

        const schema = args.length ? this.compile(args[0]) : any;
        return schema.describe();
    };

    root.compile = function (schema) {

        return Cast.schema(this, schema, { appendPath: true });
    };

    root.assert = function (...args) {

        this.attempt(...args);
    };

    root.attempt = function (value, schema, ...args/* [message], [options]*/) {

        const first = args[0];
        const message = first instanceof Error || typeof first === 'string' ? first : null;
        const options = message ? args[1] : args[0];
        const result = this.validate(value, schema, options);
        const error = result.error;

        if (!error) {
            return result.value;
        }

        if (message instanceof Error) {
            throw message;
        }

        if (typeof error.annotate === 'function') {
            error.message = message ?
                `${message} ${error.annotate()}` :
                error.annotate();
        }

        throw error;
    };

    root.reach = function (schema, path) {

        Hoek.assert(schema && schema instanceof Any, 'you must provide a joi schema');
        Hoek.assert(Array.isArray(path) || typeof path === 'string', 'path must be a string or an array of strings');

        const reach = (sourceSchema, schemaPath) => {

            if (!schemaPath.length) {
                return sourceSchema;
            }

            const children = sourceSchema._inner.children;
            if (!children) {
                return;
            }

            const key = schemaPath.shift();
            for (let i = 0; i < children.length; ++i) {
                const child = children[i];
                if (child.key === key) {
                    return reach(child.schema, schemaPath);
                }
            }
        };

        const schemaPath = typeof path === 'string' ? (path ? path.split('.') : []) : path.slice();

        return reach(schema, schemaPath);
    };

    root.lazy = function (...args) {

        return internals.callWithDefaults.call(this, Lazy, args);
    };

    root.defaults = function (fn) {

        Hoek.assert(typeof fn === 'function', 'Defaults must be a function');

        let joi = Object.create(this.any());
        joi = fn(joi);

        Hoek.assert(joi && joi instanceof this.constructor, 'defaults() must return a schema');

        Object.assign(joi, this, joi.clone()); // Re-add the types from `this` but also keep the settings from joi's potential new defaults

        joi._defaults = (schema) => {

            if (this._defaults) {
                schema = this._defaults(schema);
                Hoek.assert(schema instanceof this.constructor, 'defaults() must return a schema');
            }

            schema = fn(schema);
            Hoek.assert(schema instanceof this.constructor, 'defaults() must return a schema');
            return schema;
        };

        return joi;
    };

    root.bind = function () {

        const joi = Object.create(this);

        joi._binds.forEach((bind) => {

            joi[bind] = joi[bind].bind(joi);
        });

        return joi;
    };

    root.extend = function (...extensions) {

        Common.verifyFlat(extensions, 'extend');

        Hoek.assert(extensions.length, 'You need to provide at least one extension');

        this.assert(extensions, root.extensionsSchema);

        const joi = Object.create(this.any());
        Object.assign(joi, this);
        joi._currentJoi = joi;
        joi._binds = new Set(joi._binds);

        for (let i = 0; i < extensions.length; ++i) {
            let extension = extensions[i];

            if (typeof extension === 'function') {
                extension = extension(joi);
            }

            this.assert(extension, root.extensionSchema);

            const base = (extension.base || this.any()).clone(); // Cloning because we're going to override messages afterwards
            const ctor = base.constructor;
            const type = class extends ctor { // eslint-disable-line no-loop-func

                constructor() {

                    super();
                    if (extension.base) {
                        Object.assign(this, base);
                    }

                    this._type = extension.name;
                }

            };

            if (extension.messages) {
                type.prototype._messages = Hoek.applyToDefaults(type.prototype._messages || (base._preferences && base._preferences.messages) || {}, extension.messages);
            }

            if (extension.coerce) {
                type.prototype._coerce = function (value, state, prefs) {

                    if (ctor.prototype._coerce) {
                        const baseRet = ctor.prototype._coerce.call(this, value, state, prefs);
                        if (baseRet) {
                            if (baseRet.errors) {
                                return baseRet;
                            }

                            value = baseRet.value;
                        }
                    }

                    const ret = extension.coerce.call(this, value, state, prefs);
                    if (ret instanceof Errors.Report) {
                        return { value, errors: ret };
                    }

                    return { value: ret };
                };
            }

            if (extension.pre) {
                type.prototype._base = function (value, state, prefs) {

                    if (ctor.prototype._base) {
                        const baseRet = ctor.prototype._base.call(this, value, state, prefs);

                        if (baseRet.errors) {
                            return baseRet;
                        }

                        value = baseRet.value;
                    }

                    const ret = extension.pre.call(this, value, state, prefs);
                    if (ret instanceof Errors.Report) {
                        return { value, errors: ret };
                    }

                    return { value: ret };
                };
            }

            if (extension.rules) {
                for (let j = 0; j < extension.rules.length; ++j) {
                    const rule = extension.rules[j];
                    const ruleArgs = rule.params ? (rule.params instanceof Any ? rule.params._inner.children.map((k) => k.key) : Object.keys(rule.params)) : [];
                    const validateArgs = rule.params ? Cast.schema(this, rule.params) : null;

                    type.prototype[rule.name] = function (...rArgs) { // eslint-disable-line no-loop-func

                        if (rArgs.length > ruleArgs.length) {
                            throw new Error('Unexpected number of arguments');
                        }

                        let hasRef = false;
                        let arg = {};

                        for (let k = 0; k < ruleArgs.length; ++k) {
                            arg[ruleArgs[k]] = rArgs[k];
                            if (!hasRef && Ref.isRef(rArgs[k])) {
                                hasRef = true;
                            }
                        }

                        if (validateArgs) {
                            arg = joi.attempt(arg, validateArgs);
                        }

                        let schema;
                        if (rule.validate && !rule.setup) {
                            const validate = function (value, state, prefs) {

                                return rule.validate.call(this, arg, value, state, prefs);
                            };

                            schema = this._test(rule.name, arg, validate, { description: rule.description, hasRef });
                        }
                        else {
                            schema = this.clone();
                        }

                        if (rule.setup) {
                            const newSchema = rule.setup.call(schema, arg);
                            if (newSchema !== undefined) {
                                Hoek.assert(newSchema instanceof Any, `Setup of extension Joi.${this._type}().${rule.name}() must return undefined or a Joi object`);
                                schema = newSchema;
                            }

                            if (rule.validate) {
                                const validate = function (value, state, prefs) {

                                    return rule.validate.call(this, arg, value, state, prefs);
                                };

                                schema = schema._test(rule.name, arg, validate, { description: rule.description, hasRef });
                            }
                        }

                        return schema;
                    };
                }
            }

            if (extension.describe) {
                type.prototype.describe = function () {

                    const description = ctor.prototype.describe.call(this);
                    return extension.describe.call(this, description);
                };
            }

            const instance = new type();
            joi[extension.name] = function (...extArgs) {

                return internals.callWithDefaults.call(this, instance, extArgs);
            };

            joi._binds.add(extension.name);
        }

        return joi;
    };

    root.extensionSchema = internals.object.keys({
        base: internals.object.schema(),
        name: internals.string.required(),
        coerce: internals.func.arity(3),
        pre: internals.func.arity(3),
        messages: internals.object,
        describe: internals.func.arity(1),
        rules: internals.array.items(internals.object.keys({
            name: internals.string.required(),
            setup: internals.func.arity(1),
            validate: internals.func.arity(4),
            params: internals.object.when('params', {                        // Self referencing when() instead of alternatives for better error messages
                is: internals.object.schema(),
                then: internals.object.schema('object'),
                otherwise: internals.object.pattern(/.*/, internals.object.schema())
            }),
            description: [internals.string, internals.func.arity(1)]
        }).or('setup', 'validate'))
    }).strict();

    root.extensionsSchema = internals.array.items(internals.object, internals.func.arity(1)).strict();

    root.version = require('../package.json').version;

    root.schema = Common.symbols.schema;

    return root;
};


module.exports = internals.root();
