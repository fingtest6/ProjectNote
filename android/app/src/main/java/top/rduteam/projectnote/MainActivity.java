package top.rduteam.projectnote;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(NativeExporterPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
