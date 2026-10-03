package com.sheshield.app.ui.screens

import android.os.Bundle
import android.view.*
import android.widget.LinearLayout
import com.sheshield.app.R
import com.sheshield.app.ui.components.Ui

class HistoryFragment:ScreenFragment(){
    private lateinit var list:LinearLayout
    override fun onCreateView(inflater:LayoutInflater,container:ViewGroup?,state:Bundle?):View{val c=requireContext();val body=page("Activity",false);body.addView(Ui.text(c,"Your journeys, all in one place.",16,tint=R.color.on_surface_secondary));body.addView(Ui.space(c,24));list=Ui.col(c);body.addView(list);return Ui.scroll(c,body)}
    override fun onViewCreated(view:View,state:Bundle?){super.onViewCreated(view,state);main.tripViewModel.history.observe(viewLifecycleOwner){trips->val c=requireContext();list.removeAllViews()
        if(trips.isEmpty())list.addView(Ui.card(c,Ui.col(c,24).apply{addView(Ui.title(c,"Your first journey awaits",22));addView(Ui.text(c,"Plan a walk and your journey will appear here when you finish.",15,tint=R.color.on_surface_secondary))}))
        trips.forEach{trip->val body=Ui.col(c,20);body.addView(Ui.badge(c,if(trip.isRehearsal)"Practice" else trip.state.name.lowercase().replace('_',' ').replaceFirstChar{it.uppercase()}));body.addView(Ui.space(c,12));body.addView(Ui.text(c,trip.destinationLabel.substringBefore(','),18,true));body.addView(Ui.text(c,java.text.DateFormat.getDateTimeInstance().format(java.util.Date(trip.startedAtMs)),14,tint=R.color.on_surface_secondary));if(trip.isEnded){body.addView(Ui.text(c,"${((trip.endedAtMs-trip.startedAtMs)/60000).coerceAtLeast(1)} minutes · monitoring stopped",14));body.addView(Ui.button(c,"Delete journey",true){Ui.confirm(c,"Delete this journey?","This removes the saved journey summary.","Delete"){runAction{repo.deleteTrip(trip)}}})}else body.addView(Ui.button(c,"Resume journey"){main.navigate(R.id.activeTripFragment)});list.addView(Ui.card(c,body))}
    }}
}
