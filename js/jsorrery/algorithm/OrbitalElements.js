
define(
	[
		'jsorrery/NameSpace',
		'jquery',
		'three'
	],
	function(ns, $) {
		'use strict';
		var maxIterationsForEccentricAnomaly = 10;
		var maxDE = 1e-15;

		var Deg = {
			sin : function(v) {
				return Math.sin(v * ns.DEG_TO_RAD);
			},
			cos : function(v) {
				return Math.cos(v * ns.DEG_TO_RAD);
			}
		};

		return {
			setDefaultOrbit : function(orbitalElements, calculator) {
				this.orbitalElements = orbitalElements;
				this.calculator = calculator;
			},

			setName : function(name){
				this.name = name;
			},

			calculateVelocity : function(timeEpoch, relativeTo, isFromDelta) {
				if(!this.orbitalElements) return new THREE.Vector3(0,0,0);

				var eclipticVelocity;
				
    			if ( isFromDelta ) {
	    			var pos1 = this.calculatePosition(timeEpoch);
    				var pos2 = this.calculatePosition(timeEpoch + 60);
    				eclipticVelocity = pos2.sub(pos1).multiplyScalar(1/60);
    			} else {
    				//vis viva to calculate speed (not velocity, i.e not a vector)
					var el = this.calculateElements(timeEpoch);
					var speed = Math.sqrt(ns.G * ns.U.getBody(relativeTo).mass * ((2 / (el.r)) - (1 / (el.a))));

					//now calculate velocity orientation, that is, a vector tangent to the orbital ellipse
					var k = el.r / el.a;
					var o = ((2 - (2 * el.e * el.e)) / (k * (2-k)))-1;
					//floating point imprecision
					o = o > 1 ? 1 : o;
					var alpha = Math.PI - Math.acos(o);
					alpha = el.v < 0 ? (2 * Math.PI) - alpha  : alpha;
					var velocityAngle = el.v + (alpha / 2);
					//velocity vector in the plane of the orbit
					var orbitalVelocity = new THREE.Vector3(Math.cos(velocityAngle), Math.sin(velocityAngle)).setLength(speed);
					var velocityEls = $.extend({}, el, {pos:orbitalVelocity, v:null, r:null});
	    			eclipticVelocity = this.getPositionFromElements(velocityEls);
    			}

    			//var diff = eclipticVelocityFromDelta.sub(eclipticVelocity);console.log(diff.length());
    			return eclipticVelocity;
				
			},

			calculatePosition : function(timeEpoch) {
				if(!this.orbitalElements) return new THREE.Vector3(0,0,0);
				var computed = this.calculateElements(timeEpoch);
				var pos =  this.getPositionFromElements(computed);
				return pos;
			},

			calculateElements : function(timeEpoch, forcedOrbitalElements) {
				if(!forcedOrbitalElements && !this.orbitalElements) return null;

				var orbitalElements = forcedOrbitalElements || this.orbitalElements;

				/*
	
				Epoch : J2000

				a 	Semi-major axis
			    e 	Eccentricity
			    i 	Inclination
			    o 	Longitude of Ascending Node (Ω)
			    w 	Argument of periapsis (ω)
				E 	Eccentric Anomaly
			    T 	Time at perihelion
			    M	Mean anomaly
			    l 	Mean Longitude
			    lp	longitude of periapsis
			    r	distance du centre
			    v	true anomaly

			    P	Sidereal period (mean value)
				Pw	Argument of periapsis precession period (mean value)
				Pn	Longitude of the ascending node precession period (mean value)

			    */

				var tDays = timeEpoch / ns.DAY;
				var T = tDays / ns.CENTURY ;
				//console.log(T);
				var computed = {
					t : timeEpoch
				};

				if(this.calculator && !forcedOrbitalElements) {
					var realorbit = this.calculator(T);
					$.extend(computed, realorbit);
				} else {

					if (orbitalElements.base) {
						var variation;
						for(var el in orbitalElements.base) {
							//cy : variation by century.
							//day : variation by day.
							variation = orbitalElements.cy ? orbitalElements.cy[el] : (orbitalElements.day[el] * ns.CENTURY);
							variation = variation || 0;
							computed[el] = orbitalElements.base[el] + (variation * T);
						}
					} else {
						computed = $.extend({}, orbitalElements);
					}

					if (undefined === computed.w) {
						computed.w = computed.lp - computed.o;
					}

					if (undefined === computed.M) {
						computed.M = computed.l - computed.lp;
					}

					computed.a = computed.a * ns.KM;//was in km, set it in m
				}

				var ePrime = ns.RAD_TO_DEG * computed.e;
				computed.E = computed.M + ePrime * Deg.sin(computed.M) * (1 + computed.e * Deg.cos(computed.M));

				var En = computed.E;
				var dE = 0;
				var dM;
				var i = 0;
				do{
					En = En + dE;
					dM = computed.M - (En - ePrime * Deg.sin(En));
					dE = dM / (1 - (computed.e * Deg.cos(En)));
					i++;
				} while(Math.abs(dE) > maxDE && i <= maxIterationsForEccentricAnomaly);

				computed.E = En % 360;
				computed.i = computed.i % 360;
				computed.o = computed.o % 360;
				computed.w = computed.w % 360;
				computed.M = computed.M % 360;
				computed.i = ns.DEG_TO_RAD * computed.i;
				computed.o = ns.DEG_TO_RAD * computed.o;
				computed.w = ns.DEG_TO_RAD * computed.w;
				computed.M = ns.DEG_TO_RAD * computed.M;
				computed.E = ns.DEG_TO_RAD * computed.E;

				//in the plane of the orbit
				computed.pos = new THREE.Vector3(computed.a * (Math.cos(computed.E) - computed.e), computed.a * (Math.sqrt(1 - (computed.e*computed.e))) * Math.sin(computed.E));

				computed.r = computed.pos.length();
    			computed.v = Math.atan2(computed.pos.y, computed.pos.x);
    			if(orbitalElements.relativeTo) {
    				var relativeTo = ns.U.getBody(orbitalElements.relativeTo);
    				if(relativeTo.tilt) {
    					computed.tilt = -relativeTo.tilt * ns.DEG_TO_RAD;
    				}
    			};
				return computed;
			},

			getPositionFromElements : function(computed) {

				if(!computed) return new THREE.Vector3(0,0,0);
				computed.r = computed.r !== null ? computed.r : computed.pos.length();
    			computed.v = computed.v !== null ? computed.v : Math.atan2(computed.pos.y, computed.pos.x);

    			var x = computed.r * ( Math.cos(computed.o) * Math.cos(computed.v+computed.w) -
    			Math.sin(computed.o) * Math.sin(computed.v+computed.w) * Math.cos(computed.i) )
			    var y = computed.r * ( Math.sin(computed.o) * Math.cos(computed.v+computed.w) +
			     Math.cos(computed.o) * Math.sin(computed.v+computed.w) * Math.cos(computed.i) )
			    var z = computed.r * Math.sin(computed.v+computed.w) * Math.sin(computed.i);/**/

				var pos = new THREE.Vector3(x, y, z);

				if(computed.tilt){
					pos.applyMatrix4( new THREE.Matrix4().makeRotationX( computed.tilt ) );
				}
				return pos;
			},

			calculatePeriod : function(elements, relativeTo) {
				var period;
				if(this.orbitalElements && this.orbitalElements.day && this.orbitalElements.day.M) {
					period = 360 / this.orbitalElements.day.M ;
				}else if(ns.U.getBody(relativeTo) && ns.U.getBody(relativeTo).k && elements) {
					period = 2 * Math.PI * Math.sqrt(Math.pow(elements.a/(ns.AU*1000), 3)) / ns.U.getBody(relativeTo).k;
				}
				period *= ns.DAY;//in seconds
				return period;
			}
		};
	}
);

