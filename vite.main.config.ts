import { defineConfig } from "vite";

// unzipper has a dependency on @aws-sdk/client-s3, which is not needed in
// our context and causes build issues. This plugin mocks it out.
function NoS3Plugin() {
  return {
    name: "no-s3",
    resolveId(id: string) {
      if (id === "@aws-sdk/client-s3") {
        return id; // Mark as resolved but empty
      }
    },
    load(id: string) {
      if (id === "@aws-sdk/client-s3") {
        return "export default {}"; // Provide an empty module
      }
    },
  };
}

// https://vitejs.dev/config
export default defineConfig({
  build: {
    rollupOptions: {
      external: [
        // This lib dynamic imports(?), cannot be processed by Vite
        // TODO: Throw it away
        "font-list",
        // Native/WASM Modules
        "7z-wasm",
        "@open-orpheus/database",
        "@open-orpheus/window",
        "@open-orpheus/ui",
      ],
    },
  },
  plugins: [NoS3Plugin()],
});
