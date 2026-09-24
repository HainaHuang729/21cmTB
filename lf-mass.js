/* Atomic-cooling halo mapping, matching this project's 21cmFAST ps.c ComputeLF.
 * Halo mass, not stellar mass. F_STAR10 is log10; t_STAR is dimensionless.
 * Constants: UsefulFunctions.c (H0), Constants.h (SperYR), Globals.h (OMr).
 * This evaluates a reference annotation, not a new LF or simulation.
 */
(() => {
  "use strict";
  function stellarFraction(logFstar10, alphaStar, mass) {
    if (![logFstar10, alphaStar, mass].every(Number.isFinite) || mass <= 0) return null;
    return Math.min(1, 10 ** logFstar10 * (mass / 1e10) ** alphaStar);
  }
  function magnitude(astro = {}, cosmology = {}, redshift, mass = 1e10) {
    const {F_STAR10, ALPHA_STAR, t_STAR} = astro;
    const {OMm, OMb, hlittle} = cosmology;
    if (![F_STAR10, ALPHA_STAR, t_STAR, OMm, OMb, hlittle, redshift, mass].every(Number.isFinite)
        || t_STAR <= 0 || mass <= 0 || OMm <= 0 || OMb <= 0 || hlittle <= 0 || redshift < 0) return null;
    const h = hlittle * 3.2407e-18 * Math.sqrt(OMm * (1 + redshift) ** 3
      + 8.6e-5 * (1 + redshift) ** 4 + 1 - OMm);
    const efficiency = stellarFraction(F_STAR10, ALPHA_STAR, mass);
    const sfr = mass * OMb / OMm * efficiency * h * 31556925.9747 / t_STAR;
    return 51.63 - 2.5 * Math.log10(sfr / 1.15e-28);
  }
  const api = {magnitude, stellarFraction};
  if (typeof module !== "undefined") module.exports = api;
  if (typeof window !== "undefined") window.AtlasLFMass = api;
})();
