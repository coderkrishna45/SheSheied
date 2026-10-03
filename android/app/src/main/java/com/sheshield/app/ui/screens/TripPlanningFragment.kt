package com.sheshield.app.ui.screens

import android.os.Bundle
import android.view.*
import android.widget.*
import com.sheshield.app.R
import com.sheshield.app.data.model.*
import com.sheshield.app.ui.components.*
import com.sheshield.app.util.LocationProvider

class TripPlanningFragment:ScreenFragment(){
    private var picker:RouteMapRenderer?=null
    private lateinit var originButton:com.google.android.material.button.MaterialButton
    private lateinit var destinationButton:com.google.android.material.button.MaterialButton
    private lateinit var coordinates:TextView
    private lateinit var findButton:com.google.android.material.button.MaterialButton
    private val vm get()=main.planningViewModel
    override fun onCreateView(inflater:LayoutInflater,container:ViewGroup?,state:Bundle?):View{
        val c=requireContext();val body=page("Plan a journey")
        if(repo.demo())body.addView(Ui.badge(c,"Practice · simulated alerts",R.color.risk_medium))
        body.addView(Ui.title(c,"A walk that fits\nyour day.",32));body.addView(Ui.space(c,10));body.addView(Ui.text(c,"Choose your start and destination.",16,tint=R.color.on_surface_secondary));body.addView(Ui.space(c,24))
        val endpoints=Ui.col(c,16)
        originButton=Ui.button(c,"Choose a starting point",true){chooseEndpoint(true)}.apply{gravity=Gravity.START or Gravity.CENTER_VERTICAL;icon=androidx.core.content.ContextCompat.getDrawable(c,R.drawable.ic_location);iconTint=textColors;maxLines=2}
        destinationButton=Ui.button(c,"Choose your destination",true){chooseEndpoint(false)}.apply{gravity=Gravity.START or Gravity.CENTER_VERTICAL;icon=androidx.core.content.ContextCompat.getDrawable(c,R.drawable.ic_search);iconTint=textColors;maxLines=2}
        coordinates=Ui.text(c,"",13,tint=R.color.on_surface_secondary)
        endpoints.addView(Ui.text(c,"FROM",11,true,R.color.on_surface_secondary));endpoints.addView(originButton);endpoints.addView(Ui.space(c,20));endpoints.addView(Ui.text(c,"TO",11,true,R.color.on_surface_secondary));endpoints.addView(destinationButton);endpoints.addView(coordinates)
        body.addView(Ui.card(c,endpoints))
        body.addView(Ui.card(c,Ui.col(c).apply{addView(Ui.rowItem(c,"Use my location",null,R.drawable.ic_location){currentLocation()});addView(Ui.divider(c,64));addView(Ui.rowItem(c,"Choose on the map",null,R.drawable.ic_map){chooseMap(null)})}))
        findButton=Ui.button(c,"Find walking routes"){
            if(vm.origin==null||vm.destination==null){Ui.error(c,"Select both endpoints first. Search a place, use your position, or pick points on the map.");return@button}
            runAction{
                val origin=vm.origin!!;val destination=vm.destination!!
                findButton.isEnabled=false;originButton.isEnabled=false;destinationButton.isEnabled=false;findButton.text="Calculating your routes…"
                vm.clearPlan()
                try{
                    val plan=repo.plan(origin,destination)
                    if(vm.origin!=origin||vm.destination!=destination)return@runAction
                    vm.plan=plan;vm.selectedRouteId=(plan.routes.firstOrNull{it.preview?.recommended==true}?:plan.routes.firstOrNull())?.routeId;main.navigate(R.id.routeComparisonFragment)
                }finally{if(isAdded){findButton.isEnabled=true;originButton.isEnabled=true;destinationButton.isEnabled=true;findButton.text="Find walking routes"}}
            }
        };body.addView(findButton);body.addView(Ui.space(c,20))
        body.addView(Ui.text(c,"Compare walking time, available reports and what is known about each route.",14,tint=R.color.on_surface_secondary))
        body.addView(Ui.section(c,"Get familiar"));body.addView(Ui.card(c,Ui.rowItem(c,"Try a practice journey","An offline walkthrough with fictional reports and simulated alerts.",R.drawable.ic_walk){recordedDemo()}))
        refresh();return Ui.scroll(c,body)
    }
    private fun refresh(){
        originButton.text=vm.origin?.label?.substringBefore(',')?:"Choose a starting point";originButton.contentDescription="Starting point: ${vm.origin?.label?:"not selected"}"
        destinationButton.text=vm.destination?.label?.substringBefore(',')?:"Choose your destination";destinationButton.contentDescription="Destination: ${vm.destination?.label?:"not selected"}"
        coordinates.visibility=View.GONE
    }
    private fun select(place:Place,origin:Boolean){if(origin)vm.chooseOrigin(place)else vm.chooseDestination(place);refresh()}
    private fun chooseEndpoint(origin:Boolean){val c=requireContext();val items=if(origin)arrayOf("Search for a starting point","Choose on map","Use my current location")else arrayOf("Search for a destination","Choose on map")
        Ui.dialog(c).setTitle(if(origin)"Starting point" else "Destination").setItems(items){_,which->when(which){0->search(origin);1->chooseMap(origin);2->currentLocation()}}.show()
    }
    private fun search(origin:Boolean){
        val c=requireContext();val content=Ui.col(c,16);val field=Ui.input(c,"Search a place in Kolkata");content.addView(field.first)
        val results=Ui.col(c);val list=Ui.scroll(c,results)
        val dialog=Ui.dialog(c).setTitle(if(origin)"Find starting point" else "Find destination").setView(content).setNegativeButton("Close",null).create()
        val button=Ui.button(c,"Search places"){
            if(field.second.text.toString().trim().length<3){field.first.error="Enter at least 3 characters";return@button};field.first.error=null
            runAction{results.removeAllViews();results.addView(Ui.text(c,"Searching nearby places…",15,tint=R.color.on_surface_secondary));try{
                val places=repo.search(field.second.text.toString().trim());results.removeAllViews()
                if(places.isEmpty())results.addView(Ui.text(c,"No places found. Try a landmark or select a map point."))
                val counts=places.groupingBy{it.label}.eachCount()
                places.forEach{place->val label=if((counts[place.label]?:0)>1)"${place.label}\n${"%.5f".format(place.latitude)}, ${"%.5f".format(place.longitude)}" else place.label;results.addView(Ui.rowItem(c,place.label.substringBefore(','),label.substringAfter(',',""),R.drawable.ic_location){select(place,origin);dialog.dismiss()});results.addView(Ui.divider(c,64))}
            }catch(e:Exception){results.removeAllViews();throw e}}
        }
        content.addView(button);content.addView(list,LinearLayout.LayoutParams(-1,Ui.dp(c,280)));dialog.show()
    }
    private fun currentLocation(){val provider=LocationProvider(requireContext());if(!provider.permitted()){main.requestLocation{if(it)currentLocation()else Ui.error(requireContext(),"You can select a starting point on the map instead.")};return}
        runAction{val fix=provider.current();select(Place("Current location",fix.latitude,fix.longitude),true)}
    }
    private fun chooseMap(origin:Boolean?){
        val c=requireContext();val map=RouteMapRenderer(c);picker=map
        val content=Ui.col(c,12);content.addView(Ui.text(c,"Press and hold the exact point you want to use.",15));content.addView(map.view,LinearLayout.LayoutParams(-1,Ui.dp(c,360)));map.view.onStart();map.view.onResume()
        map.onReady={map.endpoints(vm.origin,vm.destination,true)}
        val dialog=Ui.dialog(c).setTitle("Choose a map point").setView(content).setNegativeButton("Close",null).create()
        map.onPick={place->
            if(origin!=null){select(place,origin);dialog.dismiss()}
            else Ui.dialog(c).setTitle("Use this point as…").setItems(arrayOf("Starting point","Destination")){_,which->select(place,which==0);dialog.dismiss()}.show()
        }
        dialog.setOnDismissListener{map.view.onPause();map.view.onStop();map.destroy();picker=null};dialog.show()
    }
    private fun recordedDemo(){runAction{if(repo.active()!=null)error("Finish your current journey first.");repo.setDemo(true);vm.reset();val plan=repo.recordedPlan();vm.plan=plan;vm.selectedRouteId=plan.routes.firstOrNull()?.routeId;main.navigate(R.id.routeComparisonFragment)}}
    override fun onDestroyView(){picker?.destroy();picker=null;super.onDestroyView()}
}
