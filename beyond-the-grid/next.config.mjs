/** @type {import('next').NextConfig} */
const nextConfig = {
  // 1) Export estático: genera la carpeta out/ con HTML+JS+CSS servibles
  //    por GitHub Pages (sin servidor Node).
  output: "export",

  // 2) Project page: el sitio cuelga de https://rdr-nfq.github.io/team-hub/
  //    Sin basePath/assetPrefix, todos los /_next/... darían 404.
  basePath: "/team-hub",
  assetPrefix: "/team-hub/",

  // 3) No hay servidor que optimice imágenes en Pages.
  images: { unoptimized: true },

  // Útil en hosting estático para que /ruta sirva /ruta/index.html.
  trailingSlash: true,

  // Desactivado: con R3F, StrictMode duplica el montaje del canvas en dev.
  reactStrictMode: false,

  // pptxgenjs (Seguimiento) trae import('node:fs') / import('node:https') para
  // su modo Node; webpack no entiende el esquema "node:" en el cliente. Se
  // quita el prefijo y esos módulos se resuelven vacíos (en el navegador no se usan).
  webpack: (config, { isServer, webpack }) => {
    if (!isServer) {
      config.plugins.push(
        new webpack.NormalModuleReplacementPlugin(/^node:/, (r) => {
          r.request = r.request.replace(/^node:/, "");
        }),
      );
      config.resolve.fallback = { ...config.resolve.fallback, fs: false, https: false, os: false, path: false };
    }
    return config;
  },
};

export default nextConfig;
