package com.nikcirri.lupus;

import android.os.Bundle;
import android.view.WindowManager;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Plugin dell'app (non da npm): scarica e installa gli aggiornamenti da GitHub.
        registerPlugin(AppUpdaterPlugin.class);
        super.onCreate(savedInstanceState);
        // Durante la partita lo schermo non si spegne da solo (il Narratore non deve toccarlo di continuo).
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
    }
}
