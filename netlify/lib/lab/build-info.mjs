// The commit a Netlify build was made from. Left empty in the repository: the build command (netlify.toml) runs
// scripts/lab/build-info.mjs, which writes Netlify's COMMIT_REF here before the functions are bundled, because Netlify
// gives functions no build variables at run time. version.mjs reads it.
export const BUILD_COMMIT = '';
