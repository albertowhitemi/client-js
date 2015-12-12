(function( window, undefined ) {

	'use strict';

	function WP_API() {
		this.models = {};
		this.collections = {};
		this.views = {};
	}

	window.wp = window.wp || {};
	wp.api = wp.api || new WP_API();

})( window );

(function( window, undefined ) {

	'use strict';

	window.wp = window.wp || {};
	wp.api = wp.api || {};
	wp.api.utils = wp.api.utils || {};

	/**
	 * ECMAScript 5 shim, from MDN.
	 * @link https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Date/toISOString
	 */
	if ( ! Date.prototype.toISOString ) {
		var pad = function( number ) {
			var r = String( number );
			if ( r.length === 1 ) {
				r = '0' + r;
			}

			return r;
		};

		Date.prototype.toISOString = function() {
			return this.getUTCFullYear() +
				'-' + pad( this.getUTCMonth() + 1 ) +
				'-' + pad( this.getUTCDate() ) +
				'T' + pad( this.getUTCHours() ) +
				':' + pad( this.getUTCMinutes() ) +
				':' + pad( this.getUTCSeconds() ) +
				'.' + String( ( this.getUTCMilliseconds() / 1000 ).toFixed( 3 ) ).slice( 2, 5 ) +
				'Z';
		};
	}

	/**
	 * Parse date into ISO8601 format.
	 *
	 * @param {Date} date.
	 */
	wp.api.utils.parseISO8601 = function( date ) {
		var timestamp, struct, i, k,
			minutesOffset = 0,
			numericKeys = [ 1, 4, 5, 6, 7, 10, 11 ];

		// ES5 §15.9.4.2 states that the string should attempt to be parsed as a Date Time String Format string
		// before falling back to any implementation-specific date parsing, so that’s what we do, even if native
		// implementations could be faster.
		//              1 YYYY                2 MM       3 DD           4 HH    5 mm       6 ss        7 msec        8 Z 9 ±    10 tzHH    11 tzmm
		if ( ( struct = /^(\d{4}|[+\-]\d{6})(?:-(\d{2})(?:-(\d{2}))?)?(?:T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{3}))?)?(?:(Z)|([+\-])(\d{2})(?::(\d{2}))?)?)?$/.exec( date ) ) ) {
			// Avoid NaN timestamps caused by “undefined” values being passed to Date.UTC.
			for ( i = 0; ( k = numericKeys[i] ); ++i ) {
				struct[k] = +struct[k] || 0;
			}

			// Allow undefined days and months.
			struct[2] = ( +struct[2] || 1 ) - 1;
			struct[3] = +struct[3] || 1;

			if ( struct[8] !== 'Z' && struct[9] !== undefined ) {
				minutesOffset = struct[10] * 60 + struct[11];

				if ( struct[9] === '+' ) {
					minutesOffset = 0 - minutesOffset;
				}
			}

			timestamp = Date.UTC( struct[1], struct[2], struct[3], struct[4], struct[5] + minutesOffset, struct[6], struct[7] );
		} else {
			timestamp = Date.parse ? Date.parse( date ) : NaN;
		}

		return timestamp;
	};

	/**
	 * Helper function for getting the root URL.
	 * @return {[type]} [description]
	 */
	wp.api.utils.getRootUrl = function() {
		return window.location.origin ?
			window.location.origin + '/' :
			window.location.protocol + '/' + window.location.host + '/';
	};

	/**
	 * Helper for capitalizing strings.
	 */
	String.prototype.wpapiCapitalize = function() {
		return this.charAt(0).toUpperCase() + this.slice(1);
	};

	/**
	 * Extract a name from a passed route.
	 *
	 * @param {string} route The route to extract a name from.
	 */
	wp.api.utils.extractRouteName = function( route ) {
		var name,
			lastSlash = route.lastIndexOf( '/' );

		if ( lastSlash < 0 ) {
			return '';
		}

		name = route.substr( 0, lastSlash );
		lastSlash = name.lastIndexOf( '/' );

		return name.substr( lastSlash + 1 );
	};

	/**
	 * Extract a parent name from a passed route.
	 *
	 * @param {string} route The route to extract a name from.
	 */
	wp.api.utils.extractParentName = function( route ) {
		var name,
			lastSlash = route.lastIndexOf( '_id>[\\d]+)/' );

		if ( lastSlash < 0 ) {
			return '';
		}
		name = route.substr( 0, lastSlash - 1 );
		name = name.split( '/' );
		name.pop();
		name = name.pop();
		return name;
	};

})( window );

/* global WP_API_Settings:false */
// Suppress warning about parse function's unused "options" argument:
/* jshint unused:false */
(function( wp, WP_API_Settings, Backbone, window, undefined ) {

	'use strict';

	/**
	 * Array of parseable dates.
	 *
	 * @type {string[]}.
	 */
	var parseable_dates = [ 'date', 'modified', 'date_gmt', 'modified_gmt' ];

	/**
	 * Mixin for all content that is time stamped.
	 *
	 * @type {{toJSON: toJSON, parse: parse}}.
	 */
	var TimeStampedMixin = {
		/**
		 * Serialize the entity pre-sync.
		 *
		 * @returns {*}.
		 */
		toJSON: function() {
			var attributes = _.clone( this.attributes );

			// Serialize Date objects back into 8601 strings.
			_.each( parseable_dates, function( key ) {
				if ( key in attributes ) {
					attributes[key] = attributes[key].toISOString();
				}
			});

			return attributes;
		},

		/**
		 * Unserialize the fetched response.
		 *
		 * @param {*} response.
		 * @returns {*}.
		 */
		parse: function( response ) {

			// Parse dates into native Date objects.
			_.each( parseable_dates, function ( key ) {
				if ( ! ( key in response ) ) {
					return;
				}

				var timestamp = wp.api.utils.parseISO8601( response[key] );
				response[key] = new Date( timestamp );
			});

			// Parse the author into a User object.
			if ( 'undefined' !== typeof response.author ) {
				response.author = new wp.api.models.User( response.author );
			}

			return response;
		}
	};

	/**
	 * Mixin for all hierarchical content types such as posts.
	 *
	 * @type {{parent: parent}}.
	 */
	var HierarchicalMixin = {
		/**
		 * Get parent object.
		 *
		 * @returns {Backbone.Model}
		 */
		parent: function() {

			var object, parent = this.get( 'parent' );

			// Return null if we don't have a parent.
			if ( parent === 0 ) {
				return null;
			}

			var parentModel = this;

			if ( 'undefined' !== typeof this.parentModel ) {
				/**
				 * Probably a better way to do this. Perhaps grab a cached version of the
				 * instantiated model?
				 */
				parentModel = new this.parentModel();
			}

			// Can we get this from its collection?
			if ( parentModel.collection ) {
				return parentModel.collection.get( parent );
			} else {

				// Otherwise, get the object directly.
				object = new parentModel.constructor( {
					id: parent
				});

				// Note that this acts asynchronously.
				object.fetch();

				return object;
			}
		}
	};

	/**
	 * Backbone base model for all models.
	 */
	wp.api.WPApiBaseModel = Backbone.Model.extend(
		/** @lends WPApiBaseModel.prototype  */
		{
			/**
			 * Set nonce header before every Backbone sync.
			 *
			 * @param {string} method.
			 * @param {Backbone.Model} model.
			 * @param {{beforeSend}, *} options.
			 * @returns {*}.
			 */
			sync: function( method, model, options ) {
				options = options || {};

				if ( 'undefined' !== typeof WP_API_Settings.nonce ) {
					var beforeSend = options.beforeSend;

					options.beforeSend = function( xhr ) {
						xhr.setRequestHeader( 'X-WP-Nonce', WP_API_Settings.nonce );

						if ( beforeSend ) {
							return beforeSend.apply( this, arguments );
						}
					};
				}

				return Backbone.sync( method, model, options );
			}
		}
	);

	/**
	 * API Schema model. Contains meta information about the API.
	 */
	wp.api.models.Schema = wp.api.WPApiBaseModel.extend(
		/** @lends Shema.prototype  */
		{
			url: WP_API_Settings.root + 'wp/v2',

			defaults: {
				namespace: '',
				_links: '',
				routes: {}
			},

			/**
			 * Prevent model from being saved.
			 *
			 * @returns {boolean}.
			 */
			save: function() {
				return false;
			},

			/**
			 * Prevent model from being deleted.
			 *
			 * @returns {boolean}.
			 */
			destroy: function() {
				return false;
			}
		}
	);


})( wp, WP_API_Settings, Backbone, window );

/* global WP_API_Settings:false */
(function( wp, WP_API_Settings, Backbone, _, window, undefined ) {

	'use strict';

	/**
	 * Contains basic collection functionality such as pagination.
	 */
	wp.api.WPApiBaseCollection = Backbone.Collection.extend(
		/** @lends BaseCollection.prototype  */
		{

			/**
			 * Setup default state.
			 */
			initialize: function( models, options ) {
				this.state = {
					data: {},
					currentPage: null,
					totalPages: null,
					totalObjects: null
				};
				this.parent = options.parent || '';
			},

			/**
			 * Overwrite Backbone.Collection.sync to pagination state based on response headers.
			 *
			 * Set nonce header before every Backbone sync.
			 *
			 * @param {string} method.
			 * @param {Backbone.Model} model.
			 * @param {{success}, *} options.
			 * @returns {*}.
			 */
			sync: function( method, model, options ) {
				options = options || {};
				var beforeSend = options.beforeSend,
					self = this;

				if ( 'undefined' !== typeof WP_API_Settings.nonce ) {
					options.beforeSend = function( xhr ) {
						xhr.setRequestHeader( 'X-WP-Nonce', WP_API_Settings.nonce );

						if ( beforeSend ) {
							return beforeSend.apply( self, arguments );
						}
					};
				}

				if ( 'read' === method ) {
					if ( options.data ) {
						self.state.data = _.clone( options.data );

						delete self.state.data.page;
					} else {
						self.state.data = options.data = {};
					}

					if ( 'undefined' === typeof options.data.page ) {
						self.state.currentPage = null;
						self.state.totalPages = null;
						self.state.totalObjects = null;
					} else {
						self.state.currentPage = options.data.page - 1;
					}

					var success = options.success;
					options.success = function( data, textStatus, request ) {
						self.state.totalPages = parseInt( request.getResponseHeader( 'x-wp-totalpages' ), 10 );
						self.state.totalObjects = parseInt( request.getResponseHeader( 'x-wp-total' ), 10 );

						if ( self.state.currentPage === null ) {
							self.state.currentPage = 1;
						} else {
							self.state.currentPage++;
						}

						if ( success ) {
							return success.apply( this, arguments );
						}
					};
				}

				return Backbone.sync( method, model, options );
			},

			/**
			 * Fetches the next page of objects if a new page exists.
			 *
			 * @param {data: {page}} options.
			 * @returns {*}.
			 */
			more: function( options ) {
				options = options || {};
				options.data = options.data || {};

				_.extend( options.data, this.state.data );

				if ( 'undefined' === typeof options.data.page ) {
					if ( ! this.hasMore() ) {
						return false;
					}

					if ( this.state.currentPage === null || this.state.currentPage <= 1 ) {
						options.data.page = 2;
					} else {
						options.data.page = this.state.currentPage + 1;
					}
				}

				return this.fetch( options );
			},

			/**
			 * Returns true if there are more pages of objects available.
			 *
			 * @returns null|boolean.
			 */
			hasMore: function() {
				if ( this.state.totalPages === null ||
					 this.state.totalObjects === null ||
					 this.state.currentPage === null ) {
					return null;
				} else {
					return ( this.state.currentPage < this.state.totalPages );
				}
			}
		}
	);

})( wp, WP_API_Settings, Backbone, _, window );

/* global WP_API_Settings */
(function( window, undefined ) {

	'use strict';

	/**
	 * Initialize the wp-api, optionally passing the API root.
	 *
	 * @param {string} apiRoot The api root. Optional, defaults to WP_API_Settings.root.
	 */
	wp.api.init = function( apiRoot, versionString ) {

		apiRoot       = apiRoot || WP_API_Settings.root;
		versionString = versionString || 'wp/v2/';

		/**
		 * Construct and fetch the API schema.
		 */
		var schema = new wp.api.models.Schema(),
			schemaRoot = apiRoot.replace( wp.api.utils.getRootUrl(), '' );

		schema.fetch( {
			success: function( model ) {
				/**
				 * Iterate thru the routes, picking up models and collections to build. Builds two arrays,
				 * one for models and one for collections.
				 */
				var modelRoutes = [], collectionRoutes = [];
				_.each( model.get( 'routes' ), function( route, index ) {
					// Skip the schema root if included in the schema
					if ( index !== versionString && index !== schemaRoot && index !== ( '/' + versionString.slice( 0, -1 ) ) ) {
						// Single item models end with an id or slug
						if ( index.endsWith( '+)' ) ) {
							modelRoutes.push( { index: index, route: route } );
						} else {
							// Collections contain a number or slug inside their route
							collectionRoutes.push( { index: index, route: route } );
						}
					}
				} );

				/**
				 * Construct the models.
				 *
				 * Base the class name on the route endpoint.
				 */
				_.each( modelRoutes, function( modelRoute ) {

					// Extract the name and any parent from the route.
					var modelClassName,
						routeName  = wp.api.utils.extractRouteName( modelRoute.index ),
						parentName = wp.api.utils.extractParentName( modelRoute.index );

					// If the model has a parent in its route, add that to its class name.
					if ( '' !== parentName && parentName !== routeName ) {
						modelClassName = parentName.wpapiCapitalize() + routeName.wpapiCapitalize();
						wp.api.models[modelClassName] = wp.api.WPApiBaseModel.extend( {
							// Function that returns a constructed url based on the parent and id.
							url: function() {
								return apiRoot + versionString +
									parentName +  '/' + this.get( 'parent' ) + '/' +
									routeName  +  '/' + this.get( 'id' );
							},
							// Incldue a refence to the original route object.
							route: modelRoute
						} );
					} else {
						// This is a model without a parent in its route
						modelClassName = routeName.wpapiCapitalize();
						wp.api.models[modelClassName] = wp.api.WPApiBaseModel.extend( {
							// Function that returns a constructed url based on the id.
							url: function() {
								return apiRoot + versionString + routeName +  '/' + this.get( 'id' );
							},
							// Incldue a refence to the original route object.
							route: modelRoute
						} );
					}
				} );

				/**
				 * Construct the collections.
				 *
				 * Base the class name on the route endpoint.
				 */
				_.each( collectionRoutes, function( collectionRoute ) {

					// Extract the name and any parent from the route.
					var collectionClassName,
						routeName  = collectionRoute.index.slice( collectionRoute.index.lastIndexOf( '/' ) + 1 ),
						parentName = wp.api.utils.extractParentName( collectionRoute.index );

					// If the collection has a parent in its route, add that to its class name/
					if ( '' !== parentName && parentName !== routeName ) {

						collectionClassName = parentName.wpapiCapitalize() + routeName.wpapiCapitalize();
						wp.api.collections[collectionClassName] = wp.api.WPApiBaseCollection.extend( {
							// Function that returns a constructed url pased on the parent.
							url: function() {
								return apiRoot + versionString +
								parentName + '/' + this.parent + '/' +
								routeName;
							},
							model: wp.api.models[collectionClassName],
							route: collectionRoute
						} );
					} else {
						// This is a collection without a parent in its route.
						collectionClassName = routeName.wpapiCapitalize();
						wp.api.collections[collectionClassName] = wp.api.WPApiBaseCollection.extend( {
							// For the url of a root level collection, use a string.
							url: apiRoot + versionString + routeName,
									route: collectionRoute
								} );
					}
				} );
			},
			error: function() {
			}
		} );

	};

	wp.api.init();

})( window );
