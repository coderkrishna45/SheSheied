package com.sheshield.app.ui.screens

import android.os.Bundle
import android.view.*
import android.widget.*
import com.sheshield.app.R
import com.sheshield.app.data.model.*
import com.sheshield.app.ui.components.*
import com.sheshield.app.util.LocationProvider

class RouteComparisonFragment:ScreenFragment(){
    private var renderer:RouteMapRenderer?=null
    private lateinit var cards:LinearLayout
    private var plan:TripPlan?=null
    private var selected:RouteOption?=null
    private var departureEnabled=false
    private var departureSeconds=120
    private lateinit var routeScroller:HorizontalScrollView
    private lateinit var endpointsLabel:TextView
    private lateinit var alternativesNote:TextView
    private lateinit var protectionButton:com.google.android.material.button.MaterialButton
    override fun onCreateView(inflater:LayoutInflater,container:ViewGroup?,state:Bundle?):View{
        val c=requireContext();val root=Ui.col(c);root.setBackgroundColor(Ui.color(c,R.color.background))
        root.addView(Ui.col(c,16).apply{addView(Ui.header(c,"Walking routes",back={main.nav.popBackStack()}))})
        val frame=FrameLayout(c);val map=RouteMapRenderer(c,state);renderer=map
        map.onArea={a->WalkingDetails.area(c,a){id->avoidArea(id)}};map.onPlace={p->WalkingDetails.place(c,p)}
        map.onSelect={id->plan?.routes?.firstOrNull{it.routeId==id}?.let{selected=it;main.planningViewModel.selectedRouteId=id;render()}}
        frame.addView(map.view,FrameLayout.LayoutParams(-1,-1))
        frame.addView(Ui.icon(c,R.drawable.ic_layers,"Map details"){WalkingDetails.layer(c,map)},FrameLayout.LayoutParams(Ui.dp(c,48),Ui.dp(c,48),Gravity.TOP or Gravity.END).apply{setMargins(0,Ui.dp(c,12),Ui.dp(c,16),0)})
        root.addView(frame,LinearLayout.LayoutParams(-1,0,1f))
        val panel=Ui.col(c,18);panel.background=Ui.background(c,R.color.surface,24)
        panel.addView(Ui.row(c).apply{
            endpointsLabel=Ui.text(c,"Choose your route",20,true).apply{maxLines=2;ellipsize=android.text.TextUtils.TruncateAt.END;layoutParams=LinearLayout.LayoutParams(0,-2,1f)};addView(endpointsLabel)
            addView(Ui.icon(c,R.drawable.ic_settings,"Route preferences"){preferences()})
        })
        cards=Ui.row(c);cards.gravity=Gravity.TOP
        routeScroller=HorizontalScrollView(c).apply{isHorizontalScrollBarEnabled=false;clipToPadding=false;addView(cards);overScrollMode=View.OVER_SCROLL_IF_CONTENT_SCROLLS}
        panel.addView(routeScroller,LinearLayout.LayoutParams(-1,-2))
        alternativesNote=Ui.text(c,"",13,tint=R.color.on_surface_secondary);panel.addView(alternativesNote)
        panel.addView(Ui.rowItem(c,"Refresh walking options",null,R.drawable.ic_route){val p=plan?:return@rowItem;runAction{val updated=repo.plan(p.origin,p.destination,p.avoidAreaIds.orEmpty());plan=updated;main.planningViewModel.plan=updated;selected=updated.routes.firstOrNull{it.preview?.recommended==true}?:updated.routes.firstOrNull();main.planningViewModel.selectedRouteId=selected?.routeId;render()}})
        panel.addView(Ui.rowItem(c,"Route insights","Sources, lighting and information gaps",R.drawable.ic_info){selected?.let{RouteEvidenceDialog.show(c,it)}})
        val panelScroll=Ui.scroll(c,panel)
        root.addView(panelScroll,LinearLayout.LayoutParams(-1,Ui.dp(c,minOf(310,maxOf(190,(resources.displayMetrics.heightPixels/resources.displayMetrics.density*.32f).toInt())))))
        val footer=Ui.col(c,16);footer.setPadding(Ui.dp(c,18),Ui.dp(c,8),Ui.dp(c,18),Ui.dp(c,12));footer.setBackgroundColor(Ui.color(c,R.color.surface))
        departureEnabled=repo.prefs.getBoolean("departure_default",false);departureSeconds=repo.prefs.getInt("departure_window",120).takeIf{it in listOf(120,300)}?:120
        protectionButton=Ui.button(c,protectionLabel(),true){departureOptions()}.apply{textSize=14f;minHeight=Ui.dp(c,48);icon=androidx.core.content.ContextCompat.getDrawable(c,R.drawable.ic_shield);iconTint=textColors}
        footer.addView(protectionButton);footer.addView(Ui.button(c,"Start journey"){start()});root.addView(footer)
        return root
    }
    private fun protectionLabel()=if(departureEnabled)"Departure check-ins · ${departureSeconds/60} min" else "Departure check-ins · Off"
    private fun departureOptions(){val c=requireContext();val body=Ui.col(c,20)
        val toggle=Ui.toggle(c,"Check on me if I leave my route","A sustained departure starts a time to respond.",departureEnabled){enabled->departureEnabled=enabled;repo.prefs.edit().putBoolean("departure_default",enabled).apply();protectionButton.text=protectionLabel()}
        body.addView(toggle.first);body.addView(Ui.space(c,12))
        val window=Ui.button(c,"Response time · ${departureSeconds/60} minutes",true){}
        window.setOnClickListener{Ui.dialog(c).setTitle("Time to respond").setSingleChoiceItems(arrayOf("2 minutes","5 minutes"),if(departureSeconds==120)0 else 1){dialog,index->departureSeconds=if(index==0)120 else 300;repo.prefs.edit().putInt("departure_window",departureSeconds).apply();window.text="Response time · ${departureSeconds/60} minutes";protectionButton.text=protectionLabel();dialog.dismiss()}.setNegativeButton("Cancel",null).show()}
        body.addView(window);body.addView(Ui.space(c,16));body.addView(Ui.text(c,"Accurate GPS must stay off your route for about 45 seconds. A missed check-in requests alerts to your circle. Wait for server registration to confirm remote monitoring.",14,tint=R.color.on_surface_secondary))
        Ui.dialog(c).setTitle("Departure check-ins").setView(body).setPositiveButton("Done",null).show()
    }
    override fun onViewCreated(view:View,state:Bundle?){super.onViewCreated(view,state);runAction{plan=main.planningViewModel.plan?:repo.savedPlan();val p=plan?:error("Your route plan was not found. Calculate routes again.");if(main.planningViewModel.origin?.let{it!=p.origin}==true||main.planningViewModel.destination?.let{it!=p.destination}==true)error("Your endpoints changed. Calculate a new route for those locations.");selected=p.routes.firstOrNull{it.routeId==main.planningViewModel.selectedRouteId}?:p.routes.firstOrNull{it.preview?.recommended==true}?:p.routes.firstOrNull();render()}}
    private fun render(){val c=requireContext();val p=plan?:return;val offset=routeScroller.scrollX;cards.removeAllViews()
        endpointsLabel.text="${p.origin.label.substringBefore(',')} → ${p.destination.label.substringBefore(',')}"
        endpointsLabel.contentDescription="${p.origin.label} to ${p.destination.label}"
        alternativesNote.text=when{p.routes.firstOrNull()?.alternativesStatus=="TEMPORARILY_UNAVAILABLE"->"One walking route recovered. Alternatives are temporarily unavailable; refresh to retry.";p.routes.size==1->"The walking service found one distinct route for these endpoints.";else->"${p.routes.size} distinct walking options"}
        if(p.routes.any{it.preview!=null})alternativesNote.text="${alternativesNote.text}\nSynthetic conditions · green supportive, amber mixed, red exposed. Actual safety unknown."
        p.routes.forEach{route->
            val isSelected=selected?.routeId==route.routeId;val body=Ui.col(c,16)
            body.addView(Ui.row(c).apply{
                addView(Ui.text(c,if(route.preview?.recommended==true)"Preview choice" else if(route.extraMinutes==0)"Fastest walk" else "+${route.extraMinutes} min walking",14,true).apply{layoutParams=LinearLayout.LayoutParams(0,-2,1f)})
                if(isSelected)addView(Ui.glyph(c,R.drawable.ic_check,R.color.purple_primary,18))
            })
            body.addView(Ui.space(c,12));body.addView(Ui.text(c,"${(route.durationSeconds+59)/60} min",30,true));body.addView(Ui.space(c,6))
            body.addView(Ui.text(c,"${"%.1f".format(route.distanceMeters/1000)} km · walking",14,tint=R.color.on_surface_secondary));body.addView(Ui.space(c,12))
            route.preview?.let{preview->
                body.addView(Ui.text(c,preview.label,15,true,ConditionPreviewUi.color(preview)))
                body.addView(Ui.text(c,ConditionPreviewUi.detail(preview),12,tint=R.color.on_surface_secondary))
                body.addView(Ui.text(c,"Synthetic conditions${if(route.extraMinutes>0)" · +${route.extraMinutes} min" else " · fastest"}",11,tint=R.color.on_surface_secondary))
            }?:body.addView(Ui.text(c,if(route.isDemoData)"Practice · fictional ${route.riskLevel.lowercase()} exposure" else "Safety information incomplete",12,tint=if(route.isDemoData)R.color.risk_medium else R.color.on_surface_secondary))
            if((route.environment?.summary?.restrictedMeters?:0)>0)body.addView(Ui.text(c,"Access restriction recorded",13,true,R.color.risk_high))
            val card=Ui.card(c,body,isSelected);card.layoutParams=LinearLayout.LayoutParams(Ui.dp(c,230),-2).apply{marginEnd=Ui.dp(c,10);topMargin=Ui.dp(c,10);bottomMargin=Ui.dp(c,4)}
            card.isFocusable=true;card.contentDescription="${route.label}, ${(route.durationSeconds+59)/60} minutes, ${route.distanceMeters.toInt()} metres${route.preview?.let{", synthetic conditions: ${it.label}, ${ConditionPreviewUi.detail(it)}"}.orEmpty()}${if(isSelected)", selected" else ""}"
            card.setOnClickListener{selected=route;main.planningViewModel.selectedRouteId=route.routeId;render()};cards.addView(card)
        }
        routeScroller.post{routeScroller.scrollTo(offset,0)};renderer?.routes(p.routes,selected?.routeId);renderer?.endpoints(p.origin,p.destination)
    }
    private fun preferences(){val p=plan?:return;val c=requireContext()
        if(p.routes.all{it.isDemoData}){Ui.error(c,"Recorded rehearsal uses its fictional comparison. Plan a real walk to inspect walking conditions.");return}
        val available=p.routes.firstOrNull()?.environment?.preferenceAvailability
        val options=mutableListOf("Fastest walking route");val keys=mutableListOf("FASTEST")
        if(available?.lighting==true){options.add("Prefer mapped lighting");keys.add("LIGHTING")}
        if(available?.nearbyPlaces==true){options.add("Keep mapped places nearby");keys.add("NEARBY_PLACES")}
        Ui.dialog(c).setTitle("Choose your route preference").setItems(options.toTypedArray()){_,index->
            Ui.dialog(c).setTitle("Maximum additional walking time").setItems(arrayOf("3 minutes","5 minutes","10 minutes")){_,extra->runAction{
                val updated=repo.comparePlan(p,keys[index],listOf(3,5,10)[extra]);plan=updated;main.planningViewModel.plan=updated;selected=updated.routes.firstOrNull();main.planningViewModel.selectedRouteId=selected?.routeId;render()
            }}.setNegativeButton("Cancel",null).show()
        }.setNeutralButton("Data availability"){_,_->Ui.dialog(c).setMessage("Lighting preference: ${if(available?.lighting==true)"comparison available" else "insufficient coverage"}\nNearby-place preference: ${if(available?.nearbyPlaces==true)"comparison available" else "insufficient mapped connections/hours"}\n\nPreferences appear when enough data supports comparing these options. Walking time remains available.").setPositiveButton("OK",null).show()}.setNegativeButton("Cancel",null).show()
    }
    private fun avoidArea(id:String){val p=plan?:return
        Ui.confirm(requireContext(),"Find routes around this area?","This is an area mentioned by a report; its streets have not been classified as dangerous. Routes cannot avoid the whole area if your start or destination is inside it.","Find alternatives"){
            runAction{val updated=repo.plan(p.origin,p.destination,(p.avoidAreaIds.orEmpty()+id).distinct());plan=updated;main.planningViewModel.plan=updated;selected=updated.routes.firstOrNull{it.preview?.recommended==true}?:updated.routes.firstOrNull();main.planningViewModel.selectedRouteId=selected?.routeId;render()}
        }
    }
    private fun start(){val p=plan?:return;val route=selected?:return
        if(!LocationProvider(requireContext()).permitted()){main.requestLocation{if(it)start()else Ui.error(requireContext(),"Allow location access to run journey monitoring. Rehearsal still uses simulated positions.")};return}
        val begin={runAction{repo.start(p,route,DepartureProtection(departureEnabled,departureSeconds));main.requestNotifications();main.tripViewModel.startTracking();main.navigate(R.id.activeTripFragment)}}
        if(departureEnabled)Ui.confirm(requireContext(),"Departure check-ins",if(p.mode=="REHEARSAL")"Practice will simulate a check-in after a sustained departure. No real calls or SMS." else "If you leave the path for about 45 seconds with accurate GPS, you will have ${departureSeconds/60} minutes to confirm. A missed check-in requests calls and SMS to: ${repo.contacts().joinToString{it.name}.ifBlank{"no contacts selected — add your circle before relying on alerts"}}. Wait for server confirmation; delivery depends on connectivity and account eligibility.","Start journey"){begin()} else begin()
    }
    override fun onStart(){super.onStart();renderer?.view?.onStart()}
    override fun onResume(){super.onResume();renderer?.view?.onResume()}
    override fun onPause(){renderer?.view?.onPause();super.onPause()}
    override fun onStop(){renderer?.view?.onStop();super.onStop()}
    override fun onSaveInstanceState(out:Bundle){super.onSaveInstanceState(out);renderer?.view?.onSaveInstanceState(out)}
    override fun onDestroyView(){renderer?.destroy();renderer=null;super.onDestroyView()}
}
