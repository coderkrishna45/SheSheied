package com.sheshield.app.ui.screens

import android.content.Intent
import android.os.Bundle
import android.view.*
import android.widget.*
import androidx.lifecycle.lifecycleScope
import com.sheshield.app.R
import com.sheshield.app.data.model.*
import com.sheshield.app.ui.components.*
import com.sheshield.app.service.TripTrackingService
import com.sheshield.app.util.*
import kotlinx.coroutines.*

class ActiveTripFragment:ScreenFragment(){
    private var renderer:RouteMapRenderer?=null
    private lateinit var status:TextView
    private lateinit var metrics:TextView
    private lateinit var maneuver:TextView
    private lateinit var countdown:TextView
    private lateinit var watchStatus:TextView
    private lateinit var checkReason:TextView
    private lateinit var evidenceStatus:TextView
    private lateinit var normal:LinearLayout
    private lateinit var check:LinearLayout
    private lateinit var sosPanel:LinearLayout
    private lateinit var strip:ExposureStrip
    private var demoControls:LinearLayout?=null
    private lateinit var recalc:com.google.android.material.button.MaterialButton
    private var loop:Job?=null
    private var routeRevision=""
    private var current:ActiveTrip?=null
    private var rerouting=false
    private var previewMap:RouteMapRenderer?=null
    private var previewDialog:androidx.appcompat.app.AlertDialog?=null
    override fun onCreateView(inflater:LayoutInflater,container:ViewGroup?,state:Bundle?):View{
        val c=requireContext();val root=Ui.col(c);root.setBackgroundColor(Ui.color(c,R.color.background));root.addView(Ui.col(c,16).apply{addView(Ui.header(c,"Your journey",back={main.navigate(R.id.homeFragment)}))})
        val frame=FrameLayout(c);val map=RouteMapRenderer(c,state);map.navigation();map.onArea={a->WalkingDetails.area(c,a){id->requestAlternative(avoidAreaId=id)}};map.onPlace={p->WalkingDetails.place(c,p){id->requestAlternative(viaPlaceId=id)}};renderer=map;frame.addView(map.view,FrameLayout.LayoutParams(-1,-1))
        frame.addView(Ui.icon(c,R.drawable.ic_location,"Recenter on your position"){map.recenter()},FrameLayout.LayoutParams(Ui.dp(c,48),Ui.dp(c,48),Gravity.BOTTOM or Gravity.END).apply{setMargins(0,0,Ui.dp(c,16),Ui.dp(c,32))})
        frame.addView(Ui.icon(c,R.drawable.ic_layers,"Map details"){WalkingDetails.layer(c,map)},FrameLayout.LayoutParams(Ui.dp(c,48),Ui.dp(c,48),Gravity.TOP or Gravity.START).apply{setMargins(Ui.dp(c,16),Ui.dp(c,12),0,0)})
        frame.addView(Ui.button(c,"SOS",danger=true){sos()},FrameLayout.LayoutParams(Ui.dp(c,88),Ui.dp(c,52),Gravity.TOP or Gravity.END).apply{setMargins(0,Ui.dp(c,12),Ui.dp(c,16),0)})
        root.addView(frame,LinearLayout.LayoutParams(-1,0,1f))
        val panel=Ui.col(c,20);panel.background=Ui.background(c,R.color.surface,24)
        status=Ui.text(c,"Preparing your journey…",13,true,R.color.purple_primary);panel.addView(status);panel.addView(Ui.space(c,12))
        metrics=Ui.text(c,"Finding your position",30,true);panel.addView(metrics);panel.addView(Ui.space(c,8));maneuver=Ui.text(c,"Continue along your selected route",16,tint=R.color.on_surface_secondary);panel.addView(maneuver)
        strip=ExposureStrip(c);panel.addView(strip,LinearLayout.LayoutParams(-1,Ui.dp(c,24)))
        evidenceStatus=Ui.text(c,"",13,tint=R.color.on_surface_secondary);panel.addView(evidenceStatus)
        normal=Ui.col(c)
        normal.addView(Ui.button(c,"Walk with me · set a check-in"){chooseWatch()})
        val actions=Ui.row(c)
        recalc=Ui.button(c,"Find another way",true){chooseReroute()}.apply{textSize=14f;layoutParams=LinearLayout.LayoutParams(0,-2,1f).apply{topMargin=Ui.dp(c,10);marginEnd=Ui.dp(c,8)}};actions.addView(recalc)
        actions.addView(Ui.button(c,"Nearby places",true){nearbyPlaces()}.apply{textSize=14f;layoutParams=LinearLayout.LayoutParams(0,-2,1f).apply{topMargin=Ui.dp(c,10)}});normal.addView(actions);normal.addView(Ui.space(c,14))
        normal.addView(Ui.rowItem(c,"Send companion link","Text someone in your Circle",R.drawable.ic_share){shareCompanion()})
        normal.addView(Ui.divider(c,64));normal.addView(Ui.rowItem(c,"Route insights","Sources and information gaps",R.drawable.ic_info){current?.route()?.let{RouteEvidenceDialog.show(c,it)}})
        normal.addView(Ui.divider(c,64));normal.addView(Ui.rowItem(c,"Low battery protection","Server watch & last recorded position",R.drawable.ic_shield){runAction{BatteryProtection.show(c,repo,viewLifecycleOwner.lifecycleScope)}})
        normal.addView(Ui.divider(c,64));normal.addView(Ui.rowItem(c,"Finish journey",null,R.drawable.ic_check){end()})
        if(repo.demo()){val row=Ui.row(c);row.addView(Ui.button(c,"Pause / play",true){service(TripTrackingService.ACTION_PAUSE)}.apply{textSize=14f;layoutParams=LinearLayout.LayoutParams(0,-2,1f)});row.addView(Ui.button(c,"Next check-in",true){service(TripTrackingService.ACTION_SKIP)}.apply{textSize=14f;layoutParams=LinearLayout.LayoutParams(0,-2,1f)});normal.addView(row,0);demoControls=row;row.visibility=View.GONE}
        panel.addView(normal)
        check=Ui.col(c);check.addView(Ui.title(c,"Are you safe?",28));check.addView(Ui.space(c,10));checkReason=Ui.text(c,"",15,tint=R.color.on_surface_secondary);check.addView(checkReason);check.addView(Ui.space(c,16))
        countdown=Ui.text(c,"",44,true,R.color.on_surface).apply{fontFeatureSettings="tnum"};check.addView(countdown);check.addView(Ui.space(c,4));check.addView(Ui.text(c,"Time to respond before contact alerts",13,tint=R.color.on_surface_secondary))
        val answer=Ui.row(c);answer.addView(Ui.button(c,"I'm safe"){main.tripViewModel.confirmSafe()}.apply{layoutParams=LinearLayout.LayoutParams(0,-2,1f).apply{topMargin=Ui.dp(c,16);marginEnd=Ui.dp(c,8)}})
        answer.addView(Ui.button(c,"Request SOS",danger=true){sos()}.apply{layoutParams=LinearLayout.LayoutParams(0,-2,1f).apply{topMargin=Ui.dp(c,16)}});check.addView(answer)
        check.addView(Ui.space(c,14));watchStatus=Ui.text(c,"",13,false,R.color.on_surface_secondary);check.addView(watchStatus)
        check.addView(Ui.button(c,"I'm safe · change my route",true){runAction{repo.confirmSafe();repo.sync();if(repo.active()?.state==TripState.ACTIVE)chooseReroute()}})
        check.addView(Ui.rowItem(c,"Find another way",null,R.drawable.ic_route){chooseReroute()})
        check.addView(Ui.rowItem(c,"Nearby places",null,R.drawable.ic_location){nearbyPlaces()})
        check.addView(Ui.rowItem(c,"Call someone",null,R.drawable.ic_phone){callSomeone()})
        check.addView(Ui.rowItem(c,"Send companion link",null,R.drawable.ic_share){shareCompanion()})
        check.addView(Ui.rowItem(c,"Stop sharing links",null,R.drawable.ic_lock){current?.let{t->runAction{repo.revokeShares(t);Ui.info(c,"Sharing stopped","All companion links for this journey are closed. Your check-in timer continues.")}}})
        check.visibility=View.GONE;panel.addView(check)
        sosPanel=Ui.col(c);sosPanel.addView(Ui.title(c,"SOS is active",26));sosPanel.addView(Ui.button(c,"View contact updates",danger=true){main.navigate(R.id.sosFragment)});sosPanel.visibility=View.GONE;panel.addView(sosPanel)
        val scroll=Ui.scroll(c,panel);root.addView(scroll,LinearLayout.LayoutParams(-1,Ui.dp(c,minOf(470,maxOf(320,(resources.displayMetrics.heightPixels/resources.displayMetrics.density*.53f).toInt())))));return root
    }
    override fun onViewCreated(view:View,state:Bundle?){super.onViewCreated(view,state)
        main.tripViewModel.activeTrip.observe(viewLifecycleOwner){trip->current=trip;if(trip!=null)render(trip)}
        runAction{val t=repo.active();if(t==null){main.navigate(R.id.homeFragment);return@runAction};main.tripViewModel.startTracking()}
        loop=viewLifecycleOwner.lifecycleScope.launch{while(isActive){current?.let{render(it)};delay(1000)}}
    }
    private fun render(t:ActiveTrip){
        if(t.state==TripState.SOS_ACTIVE)previewDialog?.dismiss()
        val c=requireContext();val route=t.route();demoControls?.visibility=if(route?.isDemoData==true)View.VISIBLE else View.GONE
        if(route!=null&&routeRevision!="${t.tripId}:${route.revision}"){renderer?.routes(listOf(route),route.routeId,false);renderer?.endpoints(null,Place(t.destinationLabel,t.destinationLat,t.destinationLng));strip.route=route;routeRevision="${t.tripId}:${route.revision}"}
        if(t.lastUpdateMs>0)renderer?.location(LocationFix(t.lastLatitude,t.lastLongitude,t.accuracyMeters,t.lastUpdateMs))
        val age=if(t.lastUpdateMs>0)(System.currentTimeMillis()-t.lastUpdateMs)/1000 else Long.MAX_VALUE
        val problem=repo.prefs.getString("tracking_problem",null)?:repo.prefs.getString("sync_error",null)?:if(route==null)"Saved route unavailable. End this journey and calculate a new route." else null
        status.text=when{repo.prefs.getBoolean("disarm_pending:${t.tripId}",false)->"Check-in saved on phone. Server cancellation pending; contacts may still be alerted.";t.isRehearsal->if(route?.isDemoData==true)"Practice · simulated location and alerts" else "Practice · real route, simulated location and alerts";problem!=null->problem;age>60->"Location stale · precise segment alerts paused";t.syncStatus=="OFFLINE"->"Local monitoring · server unavailable";t.syncStatus=="PENDING"->"Monitoring · confirmation pending sync";else->"Monitoring · position updated ${age}s ago"+(if(repo.departureProtection(t).enabled)" · departure check-ins on" else "")}
        status.setTextColor(Ui.color(c,if(problem!=null||age>60&&!t.isRehearsal)R.color.risk_medium else R.color.risk_low))
        if(route!=null){val projection=TripMath.project(LatLng(t.lastLatitude,t.lastLongitude),route);val duration=route.durationSeconds*(projection.remainingMeters/route.distanceMeters).coerceIn(0.0,1.0)
            metrics.text="${(duration/60).toInt().coerceAtLeast(1)} min  ·  ${"%.1f".format(projection.remainingMeters/1000)} km"
            val here=route.segments.firstOrNull{it.startIndex==projection.index}
            evidenceStatus.text=route.preview?.let{"Synthetic conditions · ${it.label.lowercase()}. Actual safety unknown."}?:when{(here?.evidenceCount?:0)>0->"Reports associated with this stretch · open route evidence for their location limits";route.contextEvidence.orEmpty().isNotEmpty()->"Wider-area reports available · this lane’s safety remains unknown";here?.level=="UNKNOWN"->"Evidence gap here · choose Walk with me if you feel uneasy";else->"Missing reports do not establish safety · grey means unknown"}
            strip.progress=(1-projection.remainingMeters/route.distanceMeters).toFloat()
            maneuver.text=if(projection.remainingMeters<30&&route.destinationSnapMeters>30)"Walking access ends here. Your destination pin is ${route.destinationSnapMeters} m away." else if(repo.prefs.getBoolean("arrival_ready",false))"You're near your destination. Confirm arrival when ready." else route.steps.firstOrNull{it.wayPoints.lastOrNull()?.let{i->i>=projection.index}==true}?.instruction?:t.destinationLabel
        }
        val checking=t.state==TripState.CHECK_IN_PENDING
        strip.visibility=if(checking)View.GONE else View.VISIBLE
        metrics.visibility=if(checking)View.GONE else View.VISIBLE
        maneuver.visibility=if(checking)View.GONE else View.VISIBLE
        evidenceStatus.visibility=if(checking)View.GONE else View.VISIBLE
        normal.visibility=if(t.state==TripState.ACTIVE)View.VISIBLE else View.GONE;check.visibility=if(t.state==TripState.CHECK_IN_PENDING)View.VISIBLE else View.GONE;sosPanel.visibility=if(t.state==TripState.SOS_ACTIVE)View.VISIBLE else View.GONE
        recalc.text=if(rerouting)"Finding routes…" else if(repo.prefs.getInt("off_route_fixes",0)>=3)"Off route · find another way" else "Find another way"
        recalc.isEnabled=!rerouting
        if(t.state==TripState.CHECK_IN_PENDING){
            val personal=t.checkInId.startsWith("watch-")
            checkReason.text=if(repo.isDepartureCheck(t))"You moved away from your planned route. Confirm you are okay; you can then choose a new path." else if(personal)"Confirm when you are through this stretch." else "Your route enters an elevated reported-exposure segment. Please check in."
            val registered=repo.prefs.getString("server_event:${t.tripId}","")==t.checkInId
            val seen=repo.prefs.getLong("companion_seen:${t.tripId}",0)
            watchStatus.text=when{
                t.isRehearsal->"Practice check-in · alerts are simulated."
                !registered->"Waiting for server confirmation. The countdown is on this phone; remote alerts are unconfirmed."
                !repo.prefs.getBoolean("delivery_ready:${t.tripId}",false)->"Timer registered. Automatic calls are unavailable. You can call your circle or 112."
                else->"Timer registered. It continues if this phone disconnects. Calls are configured; delivery is unconfirmed."
            }+if(registered&&seen>0)"\nSomeone with your link acknowledged at ${java.text.DateFormat.getTimeInstance(java.text.DateFormat.SHORT).format(java.util.Date(seen))}." else if(!t.isRehearsal)"\nNo companion has acknowledged this check-in." else ""
            val seconds=((t.checkInDeadlineMs-System.currentTimeMillis())/1000).coerceAtLeast(0);countdown.text="${seconds/60}:${"%02d".format(seconds%60)}"}
    }
    private fun requestAlternative(avoidAreaId:String?=null,viaPlaceId:String?=null,avoidAhead:Int?=null){val t=current?:return;if(rerouting)return
        rerouting=true;recalc.text="Finding routes…";recalc.isEnabled=false
        runAction{try{showAlternatives(repo.reroute(t,avoidAhead=avoidAhead,avoidAreaId=avoidAreaId,viaPlaceId=viaPlaceId))}finally{rerouting=false;if(isAdded&&view!=null)current?.let{render(it)}}}
    }
    private fun nearbyPlaces(){val t=current?:return;val c=requireContext()
        runAction{
            val result=repo.nearby(t)
            if(result.places.isEmpty()){Ui.dialog(c).setMessage("No nearby facilities were found in the map records. This does not establish that none exist. Your companion and call options remain available.").setPositiveButton("OK",null).show();return@runAction}
            Ui.dialog(c).setTitle("Mapped places nearby")
                .setItems(result.places.map{"${it.name} · ${it.straightDistanceMeters} m map distance"}.toTypedArray()){_,i->WalkingDetails.place(c,result.places[i],if(result.stale)null else {id->requestAlternative(viaPlaceId=id)})}
                .setNeutralButton("Source limits"){_,_->Ui.dialog(c).setMessage(result.notice+if(result.stale)"\nThis map snapshot is old; walking options via its places are disabled." else "").setPositiveButton("OK",null).show()}.setNegativeButton("Close",null).show()
        }
    }
    private fun chooseReroute(){
        val trip=current?:return;val c=requireContext()
        if(rerouting)return
        if(trip.isRehearsal){Ui.error(c,"Live journeys can find alternatives from your GPS position. Practice uses a simulated position.");return}
        Ui.dialog(c).setTitle("Find another way")
            .setItems(arrayOf("Other walking options","Avoid the stretch 100 m ahead","Avoid the stretch 250 m ahead")){_,index->
                requestAlternative(avoidAhead=when(index){1->100;2->250;else->null})
            }.setNegativeButton("Cancel",null).show()
    }
    private fun showAlternatives(proposal:RerouteProposal){
        val c=requireContext();val trip=current?.takeIf{it.tripId==proposal.tripId}?:return
        val body=Ui.col(c,16);val map=RouteMapRenderer(c);previewMap=map
        body.addView(Ui.text(c,"From your GPS position (±${proposal.origin.accuracy.toInt()} m) to ${trip.destinationLabel}",16,true))
        body.addView(Ui.text(c,"Your current route and check-in continue until you choose. An alternative is not a safety guarantee.",14,tint=R.color.on_surface_secondary))
        body.addView(map.view,LinearLayout.LayoutParams(-1,Ui.dp(c,210)))
        var selected=proposal.routes.firstOrNull{it.preview?.recommended==true}?:proposal.routes.firstOrNull()?:return
        map.routes(proposal.routes,selected.routeId);map.location(proposal.origin)
        map.endpoints(Place("Current position",proposal.origin.latitude,proposal.origin.longitude),Place(trip.destinationLabel,trip.destinationLat,trip.destinationLng))
        map.avoidAreas(proposal.avoidAreas)
        val choices=Ui.col(c);body.addView(choices)
        val choiceButtons=mutableListOf<com.google.android.material.button.MaterialButton>()
        fun choiceLabel(index:Int,r:RouteOption)="${if(r.preview?.recommended==true)"Preview choice" else "Option ${index+1}"} · ${(r.durationSeconds+59)/60} min · ${r.distanceMeters.toInt()} m${r.preview?.let{"\nSynthetic · ${it.label}"}.orEmpty()}"
        val select:(RouteOption)->Unit={r->selected=r;map.routes(proposal.routes,r.routeId,false);choiceButtons.forEachIndexed{index,button->val option=proposal.routes[index];button.text=(if(option.routeId==r.routeId)"✓ " else "")+choiceLabel(index,option)}}
        proposal.routes.forEachIndexed{index,r->
            val button=Ui.button(c,(if(r.routeId==selected.routeId)"✓ " else "")+choiceLabel(index,r),true){select(r)};choiceButtons.add(button);choices.addView(button)
        }
        val explanation=Ui.text(c,"",14,tint=R.color.on_surface_secondary);body.addView(explanation)
        fun describe(r:RouteOption){explanation.text="Selected: option ${proposal.routes.indexOf(r)+1}\n"+(r.decision?.summary?:"Reporting coverage incomplete · safety unknown")+if(proposal.avoidAreas.isNotEmpty())"\nAvoids ${proposal.avoidAreas.size} areas you chose (35 m radius)." else ""}
        describe(selected)
        map.onSelect={id->proposal.routes.firstOrNull{it.routeId==id}?.let{select(it);describe(it)}}
        // Refresh selection text on the card buttons as well as map taps.
        for(i in 0 until choices.childCount){val r=proposal.routes[i];choices.getChildAt(i).setOnClickListener{select(r);describe(r)}}
        val previewHeight=minOf(Ui.dp(c,430),(resources.displayMetrics.heightPixels*.55).toInt())
        val viewport=FrameLayout(c).apply{addView(Ui.scroll(c,body),FrameLayout.LayoutParams(-1,previewHeight))}
        val dialog=Ui.dialog(c).setTitle("Choose an alternative")
            .setView(viewport)
            .setPositiveButton("Use route",null).setNegativeButton("Keep route",null).create()
        previewDialog=dialog
        dialog.setOnDismissListener{map.view.onPause();map.view.onStop();map.destroy();if(previewMap===map)previewMap=null;previewDialog=null}
        dialog.show();map.view.onStart();map.view.onResume()
        dialog.getButton(androidx.appcompat.app.AlertDialog.BUTTON_POSITIVE).setOnClickListener{
            runAction{
                val button=dialog.getButton(androidx.appcompat.app.AlertDialog.BUTTON_POSITIVE);button.isEnabled=false
                try{repo.acceptRoute(proposal,selected);dialog.dismiss();Toast.makeText(c,if(current?.state==TripState.CHECK_IN_PENDING)"Route updated. Your check-in timer continues." else "Route updated.",Toast.LENGTH_SHORT).show()}
                finally{if(dialog.isShowing)button.isEnabled=true}
            }
        }
    }
    private fun chooseWatch(){val t=current?:return;val c=requireContext()
        val choices=if(t.isRehearsal)arrayOf("20 seconds · rehearsal","2 minutes","5 minutes","10 minutes","Until expected arrival + 5 min")else arrayOf("2 minutes","5 minutes","10 minutes","Until expected arrival + 5 min")
        Ui.dialog(c).setTitle("Walk with me")
            .setItems(choices){_,index->
                val selected=choices[index]
                val seconds=when{selected.startsWith("20")->20;selected.startsWith("2 ")->120;selected.startsWith("5 ")->300;selected.startsWith("10 ")->600;else->{val route=t.route();val remaining=route?.let{TripMath.project(LatLng(t.lastLatitude,t.lastLongitude),it).remainingMeters/it.distanceMeters}?:1.0;((route?.durationSeconds?:300)*remaining.coerceIn(0.0,1.0)+300).toInt().coerceIn(60,1800)}}
                Ui.confirm(c,"Set a check-in?",if(t.isRehearsal)"This practice watch simulates contact escalation. No real calls or messages." else "Confirm within ${seconds/60} minutes. If you miss it, Waymate requests calls to your configured circle. Wait for confirmation that the timer is registered and calls are configured before relying on remote escalation. You can share a companion link after starting.","Start watch"){
                    runAction{repo.armWatch(seconds);main.tripViewModel.startTracking();viewLifecycleOwner.lifecycleScope.launch(Dispatchers.IO){repo.sync()}}
                }
            }.setNegativeButton("Cancel",null).show()
    }
    private fun callSomeone(){
        val contacts=repo.contacts()
        val names=contacts.map{it.name}+"Emergency · 112"
        Ui.dialog(requireContext()).setTitle("Open phone dialer")
            .setItems(names.toTypedArray()){_,index->
                val phone=contacts.getOrNull(index)?.phone?:"112"
                startActivity(Intent(Intent.ACTION_DIAL,android.net.Uri.fromParts("tel",phone,null)))
            }.setNegativeButton("Cancel",null).show()
    }
    private fun shareCompanion(){val trip=current?:return;val c=requireContext()
        if(trip.isRehearsal){Ui.info(c,"Practice journey","Practice does not send real companion messages.");return}
        val circle=repo.contacts();if(circle.isEmpty()){Ui.error(c,"Add someone to your Circle before sending a companion link.");return}
        Ui.dialog(c).setTitle("Send companion link")
            .setItems(circle.map{"${it.name} · •••• ${it.phone.takeLast(4)}"}.toTypedArray()){_,index->
                val person=circle[index];runAction{
                    val message=repo.sendCompanion(trip,person)
                    val label=Ui.text(c,"Queued for ${person.name}. Waiting for the delivery service.",16)
                    val dialog=Ui.dialog(c).setTitle("Companion message").setView(Ui.col(c,22).apply{addView(label)}).setPositiveButton("Done",null).show()
                    viewLifecycleOwner.lifecycleScope.launch{
                        while(isActive&&dialog.isShowing){
                            val update=try{repo.companionMessage(message.id)}catch(e:kotlinx.coroutines.CancellationException){throw e}catch(e:Exception){null}
                            label.text=when(update?.status){
                                null->"Could not refresh delivery status. Check your connection; avoid sending again until the outcome is known."
                                "DELIVERED"->"Delivered to ${person.name}. Their acknowledgement will appear during your check-in."
                                "SENT"->"Sent to ${person.name}. Delivery confirmation is pending."
                                "FAILED","UNDELIVERED"->"The message could not reach ${person.name}. Check cloud delivery in Circle."
                                "UNAVAILABLE"->"Cloud SMS is unavailable for ${person.name}. Check cloud delivery in Circle."
                                "CANCELLED"->"The journey link closed before this message was sent."
                                "REQUEST_UNKNOWN"->"Delivery is unconfirmed. Check the recipient before sending again."
                                "REQUESTED","SENDING"->"The provider is sending the link to ${person.name}."
                                else->"Queued for ${person.name}. Waiting for the delivery service."
                            }
                            if(update?.status in listOf("DELIVERED","FAILED","UNDELIVERED","UNAVAILABLE","CANCELLED","REQUEST_UNKNOWN"))break
                            delay(2000)
                        }
                    }
                }
            }.setNegativeButton("Cancel",null).show()
    }
    private fun service(action:String){requireContext().startService(Intent(requireContext(),TripTrackingService::class.java).setAction(action))}
    private fun end(){val t=current?:return;val host=main;Ui.confirm(requireContext(),"Finish this journey?","Location monitoring and pending check-ins will stop.","Finish journey"){
        main.tripViewModel.endTrip{val remoteNote=if(!t.isRehearsal&&repo.prefs.getBoolean("disarm_pending:${t.tripId}",false))"\nServer stop pending sync; an already registered deadline may still alert contacts." else "";val mins=((System.currentTimeMillis()-t.startedAtMs)/60000).coerceAtLeast(1);host.navigate(R.id.homeFragment);Ui.dialog(host).setTitle("You've finished your journey")
            .setMessage("${t.destinationLabel}\n$mins minutes · monitoring stopped\nYour journey is saved in Activity.$remoteNote").setPositiveButton("Done",null).show()}
    }}
    override fun onStart(){super.onStart();renderer?.view?.onStart();previewMap?.view?.onStart()}
    override fun onResume(){super.onResume();renderer?.view?.onResume();previewMap?.view?.onResume()}
    override fun onPause(){previewMap?.view?.onPause();renderer?.view?.onPause();super.onPause()}
    override fun onStop(){previewMap?.view?.onStop();renderer?.view?.onStop();super.onStop()}
    override fun onSaveInstanceState(out:Bundle){super.onSaveInstanceState(out);renderer?.view?.onSaveInstanceState(out)}
    override fun onDestroyView(){loop?.cancel();previewDialog?.dismiss();renderer?.destroy();renderer=null;current=null;demoControls=null;routeRevision="";super.onDestroyView()}
}
