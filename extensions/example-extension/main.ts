import { LensMainExtension } from "@k8slens/extensions";

export default class ExampleExtensionMain extends LensMainExtension {
  async onActivate() {
    console.log('EXAMPLE EXTENSION MAIN: ACTIVATED', this.name, this.id);
    console.log("EXAMPLE EXTENSION MAIN: has access to special folder", await this.getExtensionFileFolder())
  }

  onDeactivate() {
    console.log('EXAMPLE EXTENSION MAIN: DEACTIVATED', this.name, this.id);
  }
}
