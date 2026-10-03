package com.sheshield.app.ui.screens

import android.Manifest
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.view.*
import android.widget.*
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatDelegate
import com.google.android.material.materialswitch.MaterialSwitch
import com.sheshield.app.BuildConfig
import com.sheshield.app.R
import com.sheshield.app.ui.components.Ui
import com.sheshield.app.ui.components.BatteryProtection
import androidx.lifecycle.lifecycleScope

class SettingsFragment:ScreenFragment(){
    private var smsSwitch:MaterialSwitch?=null
    private var updatingSms=false
    private fun reflectSms(enabled:Boolean){updatingSms=true;smsSwitch?.isChecked=enabled;updatingSms=false}
    private val smsPermission=registerForActivityResult(ActivityResultContracts.RequestPermission()){granted->repo.prefs.edit().putBoolean("device_sms",granted).apply();reflectSms(granted);if(!granted)Ui.info(requireContext(),"Device texting is off","SMS permission was not granted. You can still open your messaging app from an alert.")}
    override fun onCreateView(inflater:LayoutInflater,container:ViewGroup?,state:Bundle?):View{
        val c=requireContext();val body=page("Settings")
        body.addView(Ui.section(c,"Your experience"))
        val experience=Ui.col(c)
        val mode=repo.prefs.getInt("appearance",AppCompatDelegate.MODE_NIGHT_FOLLOW_SYSTEM)
        val appearance=when(mode){AppCompatDelegate.MODE_NIGHT_NO->"Light";AppCompatDelegate.MODE_NIGHT_YES->"Dark";else->"System"}
        experience.addView(Ui.rowItem(c,"Appearance",appearance,R.drawable.ic_moon){
            Ui.dialog(c).setTitle("Appearance").setSingleChoiceItems(arrayOf("System","Light","Dark"),listOf(AppCompatDelegate.MODE_NIGHT_FOLLOW_SYSTEM,AppCompatDelegate.MODE_NIGHT_NO,AppCompatDelegate.MODE_NIGHT_YES).indexOf(mode).coerceAtLeast(0)){dialog,index->
                val selected=listOf(AppCompatDelegate.MODE_NIGHT_FOLLOW_SYSTEM,AppCompatDelegate.MODE_NIGHT_NO,AppCompatDelegate.MODE_NIGHT_YES)[index];repo.prefs.edit().putInt("appearance",selected).apply();dialog.dismiss();AppCompatDelegate.setDefaultNightMode(selected)
            }.setNegativeButton("Cancel",null).show()
        })
        experience.addView(Ui.divider(c,64));experience.addView(Ui.rowItem(c,"Journey mode",if(repo.demo())"Practice · simulated positions and alerts" else "Live · device location and contact alerts",R.drawable.ic_route){
            Ui.dialog(c).setTitle("Journey mode").setSingleChoiceItems(arrayOf("Live journeys","Practice with simulated alerts"),if(repo.demo())1 else 0){dialog,index->
                runAction{if(repo.active()!=null){Ui.error(c,"Finish your current journey before changing modes.");return@runAction};repo.setDemo(index==1);main.planningViewModel.reset();dialog.dismiss();main.nav.navigate(R.id.settingsFragment,null,androidx.navigation.NavOptions.Builder().setPopUpTo(R.id.settingsFragment,true).build())}
            }.setNegativeButton("Cancel",null).show()
        });body.addView(Ui.card(c,experience))
        body.addView(Ui.section(c,"Route comparison"))
        body.addView(Ui.card(c,Ui.toggle(c,"Salt Lake condition preview","Synthetic lighting, activity and pedestrian space on live routes. Actual safety remains unknown. Applies to new plans.",repo.prefs.getBoolean("condition_preview",true)){enabled->
            repo.prefs.edit().putBoolean("condition_preview",enabled).apply()
        }.first))
        body.addView(Ui.section(c,"Journey alerts"));val alerts=Ui.col(c)
        alerts.addView(Ui.rowItem(c,"Permissions","Location, notifications and background access",R.drawable.ic_bell){startActivity(Intent(android.provider.Settings.ACTION_APPLICATION_DETAILS_SETTINGS,Uri.parse("package:${c.packageName}")))})
        alerts.addView(Ui.divider(c))
        alerts.addView(Ui.toggle(c,"Low battery protection","Save your last position and alert your Circle if a low-battery phone stops updating.",repo.prefs.getBoolean("battery_protection",true)){enabled->
            repo.prefs.edit().putBoolean("battery_protection",enabled).apply()
            runAction{com.sheshield.app.util.BatteryReading.current(c)?.let{repo.sendBatteryHeartbeat(it)}}
        }.first)
        alerts.addView(Ui.divider(c,64));alerts.addView(Ui.rowItem(c,"Battery protection & demo","Server watch, last position and a 20-second walkthrough",R.drawable.ic_shield){runAction{BatteryProtection.show(c,repo,viewLifecycleOwner.lifecycleScope)}})
        alerts.addView(Ui.divider(c))
        val toggle=Ui.toggle(c,"Automatic device SMS","Send through your SIM. Carrier charges may apply.",repo.prefs.getBoolean("device_sms",false)){checked->if(!updatingSms){
            if(checked){reflectSms(false);Ui.confirm(c,"Enable device texting?","A live SOS can text your circle through your SIM. Your carrier's normal charges may apply.","Enable"){smsPermission.launch(Manifest.permission.SEND_SMS)}}else repo.prefs.edit().putBoolean("device_sms",false).apply()
        }};smsSwitch=toggle.second;alerts.addView(toggle.first);body.addView(Ui.card(c,alerts))
        body.addView(Ui.text(c,"Practice never sends real calls or texts. Delivery status and contact acknowledgement are shown separately.",13,tint=R.color.on_surface_secondary))
        body.addView(Ui.section(c,"Privacy & service"));val service=Ui.col(c)
        service.addView(Ui.rowItem(c,"Location & sharing","Understand what is shared and when",R.drawable.ic_lock){Ui.info(c,"Your location & privacy","During a live journey, location is sent to your journey service. Your circle receives a recorded position during SOS, or can view your journey through a private link you share.\n\nLinks expire after two hours. You can stop sharing during the journey; finishing also closes access. Journey history can be deleted in Activity.")})
        service.addView(Ui.divider(c,64));service.addView(Ui.rowItem(c,"Service connection","Connection address and service availability",R.drawable.ic_settings){connection()});body.addView(Ui.card(c,service))
        body.addView(Ui.space(c,24));body.addView(Ui.text(c,"Waymate  ${BuildConfig.VERSION_NAME}",13,true,R.color.on_surface_secondary));body.addView(Ui.space(c,6));body.addView(Ui.text(c,"Designed around your journey.",13,tint=R.color.on_surface_secondary));body.addView(Ui.space(c,20))
        return Ui.scroll(c,body)
    }
    private fun connection(){
        val c=requireContext();val body=Ui.col(c,22)
        body.addView(Ui.notice(c,"Connection settings","Use the Waymate service address supplied for your installation. A temporary address works while its host is online."));body.addView(Ui.space(c,20))
        val url=Ui.input(c,"API URL",repo.prefs.getString("backend_url",BuildConfig.BACKEND_BASE_URL)?:BuildConfig.BACKEND_BASE_URL);url.second.inputType=android.text.InputType.TYPE_CLASS_TEXT or android.text.InputType.TYPE_TEXT_VARIATION_URI;body.addView(url.first)
        val code=Ui.input(c,"Enrollment code");code.second.inputType=android.text.InputType.TYPE_CLASS_TEXT or android.text.InputType.TYPE_TEXT_VARIATION_PASSWORD;code.first.helperText="Leave empty to keep your saved code";body.addView(code.first)
        body.addView(Ui.button(c,"Save connection"){
            runAction{if(repo.active()!=null){Ui.error(c,"End your current journey before changing its connection.");return@runAction}
                val target=url.second.text.toString().trim().trimEnd('/');val uri=Uri.parse(target)
                if(uri.scheme !in listOf("http","https")||uri.host.isNullOrBlank()||uri.userInfo!=null){url.first.error="Enter an HTTP or HTTPS service address";return@runAction}
                if(uri.host?.endsWith(".n8n.cloud")==true){url.first.error="Use your Waymate API address. n8n is configured on the server.";return@runAction}
                val entered=code.second.text.toString().trim();val saved=if(entered.isNotEmpty())entered else repo.prefs.getString("enrollment_code","")?:""
                repo.prefs.edit().putString("backend_url",target).putString("enrollment_code",saved).remove("session_token").apply();url.first.error=null;Ui.info(c,"Connection saved","Check service availability to review this connection.")
            }
        })
        body.addView(Ui.section(c,"Service availability"));val status=Ui.text(c,"Run a check to see the available services.",15,tint=R.color.on_surface_secondary)
        body.addView(Ui.button(c,"Check service availability",true){runAction{
            status.text="Checking your connection…"
            try{val r=repo.ready();status.text="Walking routes: ${if(r.routing)"configured" else "unavailable"}\nStreet reports: ${r.streetReports}\nWider-area references: ${r.evidenceContext}\nContact calls: ${if(r.n8n&&r.callbacks&&r.liveAlerts)"configured for approved recipients" else "unavailable"}\nCloud SMS: ${if(r.cloudSms)"configured for approved recipients" else "unavailable"}\n\nThis checks configuration. Message delivery and complete crime coverage require separate verification."}catch(e:Exception){status.text=com.sheshield.app.data.network.NetworkClient.message(e)}
        }});body.addView(Ui.space(c,16));body.addView(status);body.addView(Ui.space(c,24));Ui.sheet(c,"Service connection",body)
    }
    override fun onDestroyView(){smsSwitch=null;super.onDestroyView()}
}
