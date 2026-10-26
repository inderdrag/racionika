package com.inderdrag.racionika;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

public class ReminderRestoreReceiver extends BroadcastReceiver {
  @Override
  public void onReceive(Context context, Intent intent) {
    try {
      ReminderEngine.restore(context);
    } catch (Exception failure) {
      android.util.Log.w("RacionikaReminders", "Reminder restore deferred until next app launch");
    }
  }
}
