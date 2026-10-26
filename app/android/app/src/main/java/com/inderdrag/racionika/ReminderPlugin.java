package com.inderdrag.racionika;

import android.content.Intent;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "RacionikaReminders")
public class ReminderPlugin extends Plugin {
  @PluginMethod
  public void testDelivery(PluginCall call) {
    try {
      ReminderEngine.testDelivery(getContext());
      android.os.PowerManager power =
          (android.os.PowerManager)
              getContext().getSystemService(android.content.Context.POWER_SERVICE);
      android.app.ActivityManager activity =
          (android.app.ActivityManager)
              getContext().getSystemService(android.content.Context.ACTIVITY_SERVICE);
      JSObject result = new JSObject();
      result.put("batterySaving", power.isPowerSaveMode());
      result.put(
          "restricted",
          android.os.Build.VERSION.SDK_INT >= 28 && activity.isBackgroundRestricted());
      call.resolve(result);
    } catch (Exception failure) {
      call.reject("Не удалось назначить тестовое уведомление.");
    }
  }

  @PluginMethod
  public void configure(PluginCall call) {
    try {
      JSArray items = call.getArray("items");
      if (items == null) {
        call.reject("Не задано расписание.");
        return;
      }
      ReminderEngine.configure(getContext(), items, call.getObject("progress"));
      call.resolve();
    } catch (Exception failure) {
      call.reject("Не удалось сохранить расписание Android.");
    }
  }

  @PluginMethod
  public void syncProgress(PluginCall call) {
    try {
      ReminderEngine.syncProgress(getContext(), call.getData());
      call.resolve();
    } catch (Exception failure) {
      call.reject("Не удалось обновить данные напоминаний.");
    }
  }

  @Override
  protected void handleOnNewIntent(Intent intent) {
    String route = intent.getStringExtra("reminderRoute");
    if (route == null) return;
    intent.removeExtra("reminderRoute");
    JSObject data = new JSObject();
    data.put("route", route);
    notifyListeners("action", data, true);
  }
}
