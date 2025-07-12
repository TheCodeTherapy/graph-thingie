import crypto from "crypto";
import fs from "fs";
import mime from "mime-types";
import path from "path";
// eslint-disable-next-line import/no-unresolved
import { optimize } from "svgo";
import { defineConfig, Plugin } from "vite";
import { createHtmlPlugin } from "vite-plugin-html";
import { viteSingleFile } from "vite-plugin-singlefile";

function generateNonce(): string {
  return crypto.randomBytes(16).toString("base64");
}

function injectNoncePlugin(): Plugin {
  const nonce = generateNonce();

  return {
    name: "vite-inject-nonce",
    enforce: "post",
    transformIndexHtml(html) {
      const metaTagRegex = /<meta[^>]*http-equiv=["']Content-Security-Policy["'][^>]*>/i;

      if (metaTagRegex.test(html)) {
        html = html.replace(
          metaTagRegex,
          `<meta http-equiv="Content-Security-Policy" content="script-src 'self' 'nonce-${nonce}'; object-src 'none';">`
        );
      } else {
        console.error("CSP meta tag not found in the HTML!");
      }

      html = html.replace(/<script([^>]*)>/g, (_match, p1) => `<script${p1} nonce="${nonce}">`);

      return html;
    }
  };
}

function viteBase64AssetPlugin(): Plugin {
  return {
    name: "vite-base64-assets",
    enforce: "pre",
    load(id: string) {
      if (id.startsWith("vite:") || !id.startsWith("/") || id.includes("\x00")) return null;
      const extension = path.extname(id);
      const mimeType = mime.lookup(extension) || "application/octet-stream";

      // prettier-ignore
      // eslint-disable-next-line
      const allowedExtensions = [
        ".glb", ".gltf", ".fbx", ".obj",
        ".png", ".jpeg", ".jpg", ".svg",
        ".gif", ".webm", ".mp4", ".mp3",
        ".ogg", ".wav",  ".ttf", ".otf"
      ];

      if (allowedExtensions.includes(extension)) {
        const fileBuffer = fs.readFileSync(id);
        return `export default "data:${mimeType};base64,${fileBuffer.toString("base64")}"`;
      }

      if (extension === ".svg") {
        const svg = fs.readFileSync(id, "utf8");
        const optimized = optimize(svg, {
          plugins: ["preset-default", "removeComments", "cleanupIds"],
          multipass: true
        });
        const encoded = encodeURIComponent(optimized.data).replace(/'/g, "%27").replace(/"/g, "%22");
        return `export default "data:image/svg+xml;charset=utf-8,${encoded}"`;
      }
    }
  };
}

function calculateBuiltSizePlugin(): Plugin {
  const bytesToHumanReadable = (bytes: number, si: boolean = false, decimalPoints: number = 3) => {
    // SI units are powers of 1000, binary units (IEC) are powers of 1024
    const threshold = si ? 1000 : 1024;

    if (Math.abs(bytes) < threshold) {
      return bytes + " Bytes";
    }

    const siUnits = ["kB", "MB", "GB", "TB", "PB", "EB", "ZB", "YB"];
    const iecUnits = ["KiB", "MiB", "GiB", "TiB", "PiB", "EiB", "ZiB", "YiB"];

    const units = si ? siUnits : iecUnits;
    let u = -1;
    const r = 10 ** decimalPoints;

    do {
      bytes /= threshold;
      ++u;
    } while (Math.round(Math.abs(bytes) * r) / r >= threshold && u < units.length - 1);

    return bytes.toFixed(decimalPoints) + " " + units[u];
  };

  return {
    name: "calculate-built-size",
    apply: "build",
    closeBundle() {
      const directory = path.resolve(__dirname, "dist");
      let totalSize = 0;

      function calculateSize(dir: string) {
        fs.readdirSync(dir, { withFileTypes: true }).forEach((entry) => {
          const fullPath = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            calculateSize(fullPath);
          } else if (entry.isFile()) {
            const stats = fs.statSync(fullPath);
            totalSize += stats.size;
          }
        });
      }

      calculateSize(directory);
      console.log(`Total built size: ${totalSize} bytes`);
      console.log(`SI size  : ${bytesToHumanReadable(totalSize, true)}`);
      console.log(`IEC size : ${bytesToHumanReadable(totalSize, false)}`);
    }
  };
}

async function getConfig() {
  const glsl = await import("vite-plugin-glsl").then((mod) => mod.default);
  return defineConfig({
    assetsInclude: ["**/*.glb", "**/*.gltf"],
    plugins: [
      glsl({
        include: [
          // Glob pattern, or array of glob patterns to import
          "**/*.glsl",
          "**/*.wgsl",
          "**/*.vert",
          "**/*.frag",
          "**/*.vs",
          "**/*.fs"
        ],
        exclude: undefined, // Glob pattern, or array of glob patterns to ignore
        warnDuplicatedImports: true, // Warn if the same chunk was imported multiple times
        defaultExtension: "glsl", // Shader suffix when no extension is specified
        minify: true, // Compress output shader code
        watch: true, // Recompile shader on change
        root: "/" // Directory for root imports
      }),
      viteSingleFile(),
      createHtmlPlugin({ minify: true }),
      viteBase64AssetPlugin(),
      injectNoncePlugin(),
      calculateBuiltSizePlugin()
    ],
    optimizeDeps: {
      include: ["vite-plugin-glsl"],
      exclude: ["fsevents"],
      esbuildOptions: {
        target: "esnext"
      }
    },
    css: {
      preprocessorOptions: {
        scss: {}
      }
    },
    build: {
      target: "esnext",
      minify: "terser",
      cssCodeSplit: false,
      assetsInlineLimit: 900000000,
      rollupOptions: {
        external: ["fsevents"]
      },
      terserOptions: {
        mangle: {
          eval: true,
          keep_fnames: false,
          module: true,
          toplevel: true,
          safari10: false
        },
        compress: {
          drop_console: true,
          drop_debugger: true
        },
        format: {
          comments: false
        }
      }
    }
  });
}

export default getConfig();
