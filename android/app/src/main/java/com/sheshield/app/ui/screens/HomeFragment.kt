package com.sheshield.app.ui.screens

import android.os.Bundle
import android.view.*
import android.widget.*
import com.sheshield.app.R
import com.sheshield.app.ui.components.*

class HomeFragment:ScreenFragment(){
    private var resumeCard:View?=null
    override fun onCreateView(inflater:LayoutInflater,container:ViewGroup?,state:Bundle?):View{
        val c=requireContext();val body=Ui.col(c,22)
        body.addView(Ui.row(c).apply{
            addView(ImageView(c).apply{setImageResource(R.drawable.ic_launcher);layoutParams=LinearLayout.LayoutParams(Ui.dp(c,38),Ui.dp(c,38));importantForAccessibility=View.IMPORTANT_FOR_ACCESSIBILITY_NO})
            addView(Ui.text(c,"Waymate",22,true).apply{layoutParams=LinearLayout.LayoutParams(0,-2,1f);setPadding(Ui.dp(c,10),0,0,0);letterSpacing=-.025f})
            addView(Ui.icon(c,R.drawable.ic_settings,"Settings"){main.navigate(R.id.settingsFragment)})
        })
        body.addView(Ui.space(c,28));body.addView(Ui.title(c,"Where are you\nheading?",34));body.addView(Ui.space(c,10))
        body.addView(Ui.text(c,"Plan your walk. Keep your people close.",16,tint=R.color.on_surface_secondary));body.addView(Ui.space(c,24))
        val journey=Ui.col(c,18)
        journey.addView(Ui.row(c).apply{
            addView(Ui.text(c,"Your next journey",18,true).apply{layoutParams=LinearLayout.LayoutParams(0,-2,1f)})
            addView(Ui.badge(c,if(repo.demo())"Practice" else "Live",if(repo.demo())R.color.risk_medium else R.color.purple_primary))
        })
        journey.addView(Ui.space(c,16));journey.addView(JourneyArtwork(c),LinearLayout.LayoutParams(-1,Ui.dp(c,112)))
        journey.addView(Ui.space(c,8));journey.addView(Ui.button(c,"Plan a journey"){main.navigate(R.id.tripPlanningFragment)}.apply{icon=androidx.core.content.ContextCompat.getDrawable(c,R.drawable.ic_arrow);iconGravity=com.google.android.material.button.MaterialButton.ICON_GRAVITY_TEXT_END;iconPadding=Ui.dp(c,10);iconTint=textColors})
        body.addView(Ui.card(c,journey))
        resumeCard=Ui.card(c,Ui.rowItem(c,"Journey in progress","Return to your route and check-ins",R.drawable.ic_route){main.navigate(R.id.activeTripFragment)}).apply{visibility=View.GONE};body.addView(resumeCard)
        body.addView(Ui.section(c,"Always within reach"))
        val quick=Ui.col(c)
        val count=repo.contacts().size
        quick.addView(Ui.rowItem(c,"Your circle",if(count==0)"Add the people you trust" else "$count trusted ${if(count==1)"contact" else "contacts"}",R.drawable.ic_contacts){main.navigate(R.id.contactsFragment)})
        quick.addView(Ui.divider(c,64))
        quick.addView(Ui.rowItem(c,"Request SOS","Alert your trusted contacts",R.drawable.ic_shield,R.color.risk_high){sos()})
        body.addView(Ui.card(c,quick))
        body.addView(Ui.space(c,4));body.addView(Ui.notice(c,if(repo.demo())"You're in practice mode" else "A check-in when you need it",if(repo.demo())"Positions and alerts are simulated. Switch to live mode in Settings." else "Start a journey, then use Walk with me to set a time to check in."))
        body.addView(Ui.space(c,24));body.addView(Ui.row(c).apply{addView(Ui.glyph(c,R.drawable.ic_lock,R.color.on_surface_secondary,15));addView(Ui.text(c,"Location sharing is yours to control.",12,tint=R.color.on_surface_secondary).apply{setPadding(Ui.dp(c,7),0,0,0)})});body.addView(Ui.space(c,8))
        return Ui.scroll(c,body)
    }
    override fun onViewCreated(view:View,state:Bundle?){super.onViewCreated(view,state)
        main.tripViewModel.activeTrip.observe(viewLifecycleOwner){resumeCard?.visibility=if(it!=null)View.VISIBLE else View.GONE}
        if(!repo.prefs.getBoolean("onboarded",false))view.post{if(isAdded)Ui.dialog(requireContext()).setTitle("Welcome to Waymate")
            .setMessage("Choose your route, keep your circle close and set a check-in when you feel uneasy.\n\nPractice mode lets you explore with simulated alerts. Route information includes its sources and any gaps.")
            .setPositiveButton("Get started"){_,_->repo.prefs.edit().putBoolean("onboarded",true).apply()}.setNeutralButton("Add my circle"){_,_->repo.prefs.edit().putBoolean("onboarded",true).apply();main.navigate(R.id.contactsFragment)}.show()}
    }
    override fun onDestroyView(){resumeCard=null;super.onDestroyView()}
}
