'use strict';

var Utils = require( './utils' ),
	Mixins = require( './mixins'),
	Emitter = require('./emitter')
;

//#build
var Frozen = {
	freeze: function( node, notify ){
		if( node && node.__ ){
			return node;
		}

		var me = this,
			frozen, mixin, cons
		;

		if( node.constructor == Array ){
			frozen = Object.create( Mixins.List );
		}
		else {
			frozen = Object.create( Mixins.Hash );
		}

		Utils.addNE( frozen, { __: {
			listener: false,
			parents: [],
			notify: notify,
			dirty: false
		}});

		// Freeze children
		Utils.each( node, function( child, key ){
			cons = child && child.constructor;
			if( cons == Array || cons == Object ){
				child = me.freeze( child, notify );
			}

			if( child && child.__ )
				me.addParent( child, frozen );

			frozen[ key ] = child;
		});

		Object.freeze( frozen );

		return frozen;
	},

	update: function( type, node, options ){
		if( !this[ type ])
			return Utils.error( 'Unknown update type: ' + type );

		return this[ type ]( node, options );
	},

	reset: function( node, value ){
		var me = this,
			frozen
		;

		if( value && value.__ ){
			frozen = value;
			frozen.__.listener = value.__.listener;
			frozen.__.parents = [];
		}
		else {
			frozen = this.freeze( node, node.__.notify );
		}

		return frozen;
	},

	replace: function( node, attrs ){
		var me = this,
			frozen = this.copyMeta( node ),
			notify = node.__.notify,
			val, cons, key, isFrozen
		;

		Utils.each( node, function( child, key ){
			isFrozen = child && child.__;

			if( isFrozen ){
				me.removeParent( child, node );
			}

			val = attrs[ key ];
			if( !val ){
				if( isFrozen )
					me.addParent( child, frozen );
				return frozen[ key ] = child;
			}

			cons = val && val.constructor;

			if( cons == Array || cons == Object )
				val = me.freeze( val, notify );

			if( val && val.__ )
				me.addParent( val, frozen );

			delete attrs[ key ];

			frozen[ key ] = val;
		});

		for( key in attrs ) {
			val = attrs[ key ];
			cons = val && val.constructor;

			if( cons == Array || cons == Object )
				val = me.freeze( val, notify );

			if( val && val.__ )
				me.addParent( val, frozen );

			frozen[ key ] = val;
		}

		Object.freeze( frozen );

		this.refreshParents( node, frozen );

		return frozen;
	},

	remove: function( node, attrs ){
		var me = this,
			frozen = this.copyMeta( node ),
			isFrozen
		;

		Utils.each( node, function( child, key ){
			isFrozen = child && child.__;

			if( isFrozen ){
				me.removeParent( child, node );
			}

			if( attrs.indexOf( key ) != -1 ){
				return;
			}

			if( isFrozen )
				me.addParent( child, frozen );

			frozen[ key ] = child;
		});

		Object.freeze( frozen );
		this.refreshParents( node, frozen );

		return frozen;
	},

	splice: function( node, args ){
		var me = this,
			frozen = this.copyMeta( node ),
			index = args[0],
			deleteIndex = index + args[1],
			notify = node.__.notify,
			con, child
		;

		// Clone the array
		Utils.each( node, function( child, i ){

			if( child && child.__ ){
				me.removeParent( child, node );

				// Skip the nodes to delete
				if( i < index || i>= deleteIndex )
					me.addParent( child, frozen );
			}

			frozen[i] = child;
		});

		// Prepare the new nodes
		if( args.length > 1 ){
			for (var i = args.length - 1; i >= 2; i--) {
				child = args[i];
				con = child && child.constructor;

				if( con == Array || con == Object )
					child = this.freeze( child, notify );

				if( child && child.__ )
					this.addParent( child, frozen );

				args[i] = child;
			}
		}

		// splice
		Array.prototype.splice.apply( frozen, args );

		Object.freeze( frozen );
		this.refreshParents( node, frozen );

		return frozen;
	},

	refresh: function( node, oldChild, newChild, returnUpdated ){
		var me = this,
			frozen = this.copyMeta( node ),
			__
		;

		Utils.each( node, function( child, key ){
			if( child == oldChild ){
				child = newChild;
			}

			if( child && (__ = child.__) ){
				if( __.dirty ){
					child = me.refresh( child, __.dirty[0], __.dirty[1], true );
				}

				me.removeParent( child, node );
				me.addParent( child, frozen );
			}

			frozen[ key ] = child;
		});

		Object.freeze( frozen );

		// If the node was dirty, clean it
		node.__.dirty = false;

		if( returnUpdated )
			return frozen;

		this.refreshParents( node, frozen );
	},

	clean: function( node ){
		return this.refresh( node, __.dirty[0], __.dirty[1], true );
	},

	copyMeta: function( node ){
		var me = this,
			frozen
		;

		if( node.constructor == Array ){
			frozen = Object.create( Mixins.List );
		}
		else {
			frozen = Object.create( Mixins.Hash );
		}

		var __ = node.__;
		Utils.addNE( frozen, {__: {
			notify: __.notify,
			listener: __.listener,
			parents: __.parents.slice( 0 ),
			dirty: false
		}});

		return frozen;
	},

	refreshParents: function( oldChild, newChild ){
		var __ = oldChild.__,
			i
		;

		if( __.listener )
			this.trigger( newChild, 'update', newChild );

		if( !__.parents.length ){
			if( __.listener ){
				__.listener.trigger( 'immediate', oldChild, newChild );
			}
		}
		else {
			for (i = __.parents.length - 1; i >= 0; i--) {
				if( i == 0 )
					this.refresh( __.parents[i], oldChild, newChild, false );
				else
					this.markDirty( __.parents[i], [oldChild, newChild] );
			}
		}
	},

	markDirty: function( node, dirt ){
		var __ = node.__,
			i
		;
		__.dirty = dirt;

		for ( i = __.parents.length - 1; i >= 0; i-- ) {
			this.markDirty( __.parents[i], dirt );
		}
	},

	removeParent: function( node, parent ){
		var parents = node.__.parents,
			index = parents.indexOf( parent )
		;

		if( index != -1 ){
			parents.splice( index, 1 );
		}
	},

	addParent: function( node, parent ){
		var parents = node.__.parents,
			index = parents.indexOf( parent )
		;

		if( index == -1 ){
			parents[ parents.length ] = parent;
		}
	},

	trigger: function( node, eventName, param ){
		var listener = node.__.listener,
			ticking = listener.ticking
		;

		listener.ticking = param;
		if( !ticking ){
			Utils.nextTick( function(){
				var updated = listener.ticking;
				listener.ticking = false;
				listener.trigger( eventName, updated );
			});
		}
	},

	createListener: function( frozen ){
		var l = frozen.__.listener;

		if( !l ) {
			l = Object.create(Emitter, {
				_events: {
					value: [],
					writable: true
				}
			});

			frozen.__.listener = l;
		}

		return l;
	}
};
//#build

module.exports = Frozen;