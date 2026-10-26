package com.inderdrag.racionika;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

public class ReminderReceiver extends BroadcastReceiver {
  @Override
  public void onReceive(Context context, Intent intent) {
    try {
      ReminderEngine.receive(context, intent);
    } catch (Exception failure) {
      android.util.Log.w("RacionikaReminders", "Reminder could not be delivered");
    }
  }
}
