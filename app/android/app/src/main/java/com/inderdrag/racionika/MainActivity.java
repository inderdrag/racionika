package com.inderdrag.racionika;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
  @Override
  protected void onCreate(Bundle savedInstanceState) {
    registerPlugin(ReminderPlugin.class);
    super.onCreate(savedInstanceState);
  }
}
