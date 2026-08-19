/** @type {import('next').NextConfig} */
const nextConfig = {
  // @omni-organizer/shared is a TS-source workspace package; let Next compile it.
  transpilePackages: ["@omni-organizer/shared"],
  // Static export so Electron can load the built app straight from disk (file://),
  // no Node server bundled inside the desktop app.
  output: "export",
};

export default nextConfig;
