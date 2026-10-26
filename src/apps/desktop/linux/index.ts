import { AppRegistry } from "react-native";
import { App } from "./src/App";

AppRegistry.registerComponent("OhMatrix", () => App);
// The window does not start a registered app by name: the entry does, on the surface it is given (rootTag 1).
AppRegistry.runApplication("OhMatrix", { initialProps: {}, rootTag: 1 });
