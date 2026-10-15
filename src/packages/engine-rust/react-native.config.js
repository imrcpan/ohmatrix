// Lets the app's autolinking find the native module of this package.
module.exports = {
  dependency: {
    platforms: {
      android: { sourceDir: "./android", packageImportPath: "import com.ohmatrix.enginerust.EngineRustPackage;" },
    },
  },
};
