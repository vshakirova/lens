import { Store } from "@k8slens/extensions";
import { toJS } from "mobx"

export type TelemetryPreferencesModel = {
  enabled: boolean;
}

export class TelemetryPreferencesStore extends Store.ExtensionStore<TelemetryPreferencesModel> {
  private constructor() {
    super({
      configName: "preferences-store",
      defaults: {
        enabled: true
      }
    })
  }

  get enabled() {
    return this.data.enabled
  }

  set enabled(v: boolean) {
    this.data.enabled = v
  }

  protected fromStore(data: TelemetryPreferencesModel): void {
    this.data = data
  }

  toJSON(): TelemetryPreferencesModel {
    return toJS({
      enabled: this.data.enabled
    }, {
      recurseEverything: true
    })
  }
}

export const telemetryPreferencesStore = TelemetryPreferencesStore.getInstance<TelemetryPreferencesStore>()
