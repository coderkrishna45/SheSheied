package com.sheshield.app.ui.screens

import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.view.*
import android.widget.*
import androidx.lifecycle.lifecycleScope
import com.sheshield.app.R
import com.sheshield.app.data.model.*
import com.sheshield.app.ui.components.Ui
import com.sheshield.app.util.*
import kotlinx.coroutines.*

class SosFragment:ScreenFragment(){
    private lateinit var details:LinearLayout
    private lateinit var stateText:TextView
    private var incident:SosIncident?=null
    private var loop:Job?=null
    private var lastRendered=""
    override fun onCreateView(inflater:LayoutInflater,container:ViewGroup?,state:Bundle?):View{
        val c=requireContext();val root=Ui.col(c);root.addView(Ui.col(c,20).apply{addView(Ui.header(c,"Emergency support",back={main.nav.popBackStack()}))});val body=Ui.col(c,20)
        val footer=Ui.col(c,12)
        stateText=Ui.text(c,"SOS requested",28,true,R.color.risk_high);body.addView(stateText);body.addView(Ui.space(c,12));body.addView(Ui.text(c,"Follow your contact updates below. You can call emergency services at any time.",16,tint=R.color.on_surface_secondary));body.addView(Ui.space(c,20))
        details=Ui.col(c);body.addView(details)
        footer.addView(Ui.button(c,"Call emergency services · 112",danger=true){startActivity(Intent(Intent.ACTION_DIAL,Uri.parse("tel:112")))})
        body.addView(Ui.section(c,"Other ways to reach your circle"));body.addView(Ui.button(c,"Open text message",true){val i=incident?:return@button;if(i.contacts.isEmpty()){Ui.error(c,"Add a trusted contact in Circle first.");return@button};if(i.mode=="REHEARSAL"){Ui.error(c,"Rehearsal sends no real messages. Switch modes for device texting.");return@button}
            val loc=i.location;val text="Waymate SOS: I may need help."+(loc?.let{" Last known location: https://maps.google.com/?q=${it.latitude},${it.longitude}"}?:" Location unavailable.")
            runCatching{startActivity(Intent(Intent.ACTION_SENDTO,Uri.parse("smsto:"+i.contacts.joinToString(";"){it.phone})).putExtra("sms_body",text))}.onFailure{Ui.error(c,"No SMS app is available on this device.")}
        })
        body.addView(Ui.button(c,"Send SMS through SIM",true){val i=incident?:return@button
            if(i.mode=="REHEARSAL"){Ui.error(c,"Practice sends no real texts.");return@button}
            if(i.contacts.isEmpty()){Ui.error(c,"Add trusted contacts in Circle first.");return@button}
            if(!repo.prefs.getBoolean("device_sms",false)){Ui.error(c,"Enable automatic device SMS in Settings and grant SMS permission to send through your SIM.");return@button}
            Ui.confirm(c,"Send through your SIM?","This sends an SOS text to your circle. Carrier charges may apply. Cloud SMS already requested could also arrive.","Send SMS"){
                SmsHelper.sendSosMessages(c,i.contacts.map{it.phone},i.location,i.id);lastRendered="";render(i)
            }
        })
        footer.addView(Ui.button(c,"Cancel future escalation",true){Ui.confirm(c,"Cancel this alert?","Future contact attempts will stop. Already sent messages cannot be recalled.","Cancel alert"){runAction{repo.cancelSos();main.navigate(R.id.homeFragment)}}})
        root.addView(Ui.scroll(c,body),LinearLayout.LayoutParams(-1,0,1f));root.addView(footer);return root
    }
    override fun onViewCreated(view:View,state:Bundle?){super.onViewCreated(view,state)
        loop=viewLifecycleOwner.lifecycleScope.launch{
            val first=repo.prefs.getString("latest_sos",null)
            if(first==null){Ui.error(requireContext(),"No alert is active. Use SOS to request help.");main.navigate(R.id.homeFragment);return@launch}
            launch(Dispatchers.IO){repo.sync()}
            while(isActive){
                val key=repo.prefs.getString("latest_sos",null)
                if(key!=null){repo.incident(key,false)?.let{incident=it;render(it)};val data=withTimeoutOrNull(4000){withContext(Dispatchers.IO){repo.incident(key)}};if(data!=null){incident=data;render(data)}}
                delay(1000)
            }
        }
    }
    private fun render(i:SosIncident){
        val c=requireContext();stateText.text=when(i.status){"ACKNOWLEDGED"->"Your contact acknowledged";"CANCELLED"->"Alert cancelled";"PENDING"->"Waiting for connection";"EXPIRED"->"Remote alert expired";"FAILED"->"Remote request failed";"UNAVAILABLE"->if(i.smsAttempts.orEmpty().any{it.status !in listOf("UNAVAILABLE","FAILED","CANCELLED","UNDELIVERED")})"SMS alerts requested" else "Cloud alerts unavailable";"EXHAUSTED"->"No call acknowledged yet";"NO_CONTACTS"->"Your circle is empty";else->"SOS is active"}
        stateText.setTextColor(Ui.color(c,when(i.status){"ACKNOWLEDGED"->R.color.risk_low;"CANCELLED"->R.color.on_surface;"PENDING"->R.color.risk_medium;else->R.color.risk_high}))
        val key=repo.gson.toJson(i)+SmsHelper.statuses(c,i.id,i.contacts.map{it.phone}).joinToString();if(key==lastRendered)return;lastRendered=key;details.removeAllViews()
        if(i.mode=="REHEARSAL")details.addView(Ui.badge(c,"REHEARSAL · NO REAL CALLS OR TEXTS"))
        val channels=Ui.col(c,16);channels.addView(Ui.text(c,"Contact updates",18,true))
        if(i.mode=="REHEARSAL")channels.addView(Ui.text(c,"Calls below are simulated. No cloud SMS is sent.",14))
        else {
            i.attempts.forEach{channels.addView(Ui.text(c,"Call · ${it.contact.name}: ${it.status.lowercase().replace('_',' ')}",14));it.unavailableReason?.let{reason->channels.addView(Ui.text(c,reason,13,tint=R.color.risk_medium))}}
            i.smsAttempts.orEmpty().forEach{channels.addView(Ui.text(c,"SMS · ${it.contact.name}: ${it.status.lowercase().replace('_',' ')}",14));it.unavailableReason?.let{reason->channels.addView(Ui.text(c,reason,13,tint=R.color.risk_medium))}}
            val attempted=i.attempts.map{it.contact.phone}.toSet()
            if(i.status!="ACKNOWLEDGED"&&!i.cancelled)i.contacts.filter{it.phone !in attempted}.forEach{channels.addView(Ui.text(c,"Call · ${it.name}: waiting their turn",14))}
            if(i.attempts.isEmpty()&&i.smsAttempts.orEmpty().isEmpty())channels.addView(Ui.text(c,"Waiting for server confirmation. Cloud delivery is unconfirmed.",14))
            channels.addView(Ui.text(c,"Delivered SMS is not an acknowledgement. A contact can press 1 during a cloud call to acknowledge.",13,tint=R.color.on_surface_secondary))
        }
        details.addView(Ui.card(c,channels))
        val loc=Ui.col(c,20);loc.addView(Ui.text(c,"Your recorded location",18,true));loc.addView(Ui.space(c,8));loc.addView(Ui.text(c,i.location?.let{"${"%.5f".format(it.latitude)}, ${"%.5f".format(it.longitude)}\nRecorded ${java.text.DateFormat.getTimeInstance().format(java.util.Date(it.timestampMs))}"}?:"Location unavailable. Your alert can still be sent.",15,tint=R.color.on_surface_secondary));details.addView(Ui.card(c,loc))
        val timeline=Ui.col(c);i.timeline.forEachIndexed{index,event->if(index>0)timeline.addView(Ui.divider(c,64));timeline.addView(Ui.rowItem(c,event.message,java.text.DateFormat.getTimeInstance(java.text.DateFormat.SHORT).format(java.util.Date(event.atMs)),R.drawable.ic_clock))};details.addView(Ui.card(c,timeline))
        if(i.mode!="REHEARSAL"){details.addView(Ui.text(c,"Device SMS",18,true));SmsHelper.statuses(c,i.id,i.contacts.map{it.phone}).forEach{details.addView(Ui.text(c,it,14,tint=R.color.on_surface_secondary))}}
        if(i.contacts.isEmpty())details.addView(Ui.button(c,"Add trusted contacts",true){main.navigate(R.id.contactsFragment)})
    }
    override fun onDestroyView(){loop?.cancel();lastRendered="";super.onDestroyView()}
}
