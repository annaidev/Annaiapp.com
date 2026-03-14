package com.annai.travelplanner;

import com.getcapacitor.BridgeActivity;
import com.annai.travelplanner.billing.BillingBridgePlugin;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(android.os.Bundle savedInstanceState) {
        registerPlugin(BillingBridgePlugin.class);
        super.onCreate(savedInstanceState);
    }
}
