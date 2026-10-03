package com.sheshield.app.ui.components

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.widget.LinearLayout
import com.sheshield.app.R
import com.sheshield.app.data.model.*

object WalkingDetails {
    fun show(c:Context,e:WalkingEnvironment){val body=Ui.col(c,20);evidence(c,body,e);Ui.sheet(c,"Walking conditions",body)}
    fun layer(c:Context,map:RouteMapRenderer){Ui.dialog(c).setTitle("Map details")
        .setItems(arrayOf("Reports · amber boundaries, including history","Lighting · blue mapped lights, amber unlit/fault","Nearby places · blue dots, assistance unconfirmed","Route only")){_,i->map.detailLayer(listOf("REPORTS","LIGHTING","PLACES","NONE")[i])}
        .setNegativeButton("Close",null).show()}
    fun area(c:Context,a:ReportArea,avoid:((String)->Unit)?=null){
        val d=Ui.dialog(c).setTitle((if(a.historical)"Historical area · " else "Reported area · ")+a.name)
            .setMessage("Your route overlaps ${a.intersectionMeters} m of this mapped area. This does not locate the incident on your street.\n\n${a.locationReason}\n\nThis boundary is area context; it does not establish a danger zone.")
            .setPositiveButton("Open report"){_,_->source(c,a.associationSourceUrl)}.setNegativeButton("Close",null)
        if(avoid!=null)d.setNeutralButton("Avoid this area"){_,_->avoid(a.id)}
        d.show()
    }
    fun hours(p:MappedPlace):String {
        val at=if(p.estimatedArrivalAt==null)"at route evaluation" else "at estimated arrival"
        return when(p.hoursStatus){"LISTED_OPEN"->"Listed hours suggest open $at; exceptions unconfirmed";"LISTED_CLOSED"->"Listed hours suggest closed $at";"CLOSING_SOON"->"Listed closing time is within 10 minutes $at";else->"Hours unknown"}
    }
    fun place(c:Context,p:MappedPlace,via:((String)->Unit)?=null){
        val d=Ui.dialog(c).setTitle(p.name).setMessage("${p.category.replace('_',' ')} · mapped facility\n${hours(p)}\n${p.openingHours?:"No opening hours supplied"}\n\n${if(p.walkingConnectionMeters>0)"${p.walkingConnectionMeters} m along a mapped connection" else "${p.straightDistanceMeters} m map distance${if(p.distanceBasis=="ROUTE")" from the route" else ""}; walking access needs checking"}\n${if(p.entranceStatus=="MAPPED_ENTRANCE")"An entrance is mapped; current access unconfirmed" else "Entrance unconfirmed"}\nAssistance is unconfirmed.")
            .setPositiveButton("Map source"){_,_->source(c,p.sourceUrl)}.setNegativeButton("Close",null)
        if(via!=null)d.setNeutralButton("Walking option via here"){_,_->via(p.id)}
        d.show()
    }
    fun source(c:Context,url:String){val uri=Uri.parse(url);if(uri.scheme!="https"||uri.host.isNullOrBlank()||uri.userInfo!=null)return;runCatching{c.startActivity(Intent(Intent.ACTION_VIEW,uri))}.onFailure{Ui.error(c,"A browser could not open this source.")}}
    fun evidence(c:Context,body:LinearLayout,e:WalkingEnvironment){
        body.addView(Ui.space(c,14));body.addView(Ui.section(c,"At estimated arrival"))
        val expired=runCatching{java.time.Instant.parse(e.validUntil).toEpochMilli()<=System.currentTimeMillis()}.getOrDefault(true)
        if(e.stale||expired)body.addView(Ui.text(c,"This condition comparison is old. Refresh before relying on time-sensitive information.",14,true,R.color.risk_medium))
        body.addView(Ui.text(c,"${e.summary.lightingKnownMeters} m with lighting information · ${e.summary.unknownLightingMeters} m unknown\n${e.summary.mappedWalkwayMeters} m with mapped walking infrastructure\nPedestrian activity is unknown.",14))
        e.reportAreas.orEmpty().forEach{a->body.addView(Ui.button(c,"${if(a.historical)"Historical · " else ""}${a.name} area report",true){area(c,a)})}
        e.stretches.orEmpty().filter{it.lighting!="UNKNOWN"||it.walkway!="UNKNOWN"||it.restricted}.take(25).forEach{s->
            val light=when(s.lighting){"MAPPED_LIT"->"Lights mapped; working status unknown";"MAPPED_UNLIT"->"Mapped without lighting; current status unconfirmed";"OBSERVED_OUT"->"Lighting fault observed (at evaluation)";"OBSERVED_WORKING"->"Working lights observed (at evaluation)";"CONFLICT"->"Lighting sources disagree";else->"Lighting unknown"}
            body.addView(Ui.text(c,"${s.fromMeters}–${s.toMeters} m · ${s.phase.replace('_',' ').lowercase()}\n$light\n${s.walkway.replace('_',' ').lowercase()}${if(s.restricted)" · access restriction recorded" else ""}\nMap last edited ${s.mapUpdatedAt?.take(10)?:"unknown"}; edit date is not a survey.",13))
            s.sourceUrl?.let{url->body.addView(Ui.button(c,"Open map record",true){source(c,url)})}
        }
        e.surroundings.orEmpty().forEach{body.addView(Ui.text(c,"Mapped surroundings: ${it.kind.replace('_',' ')} · ${it.name}. This does not establish safety.",13))}
        body.addView(Ui.space(c,10));body.addView(Ui.text(c,"Nearby mapped places",18,true))
        val places=(e.facilities.orEmpty()+e.nearbyPlaces.orEmpty()).distinctBy{it.id}.take(5)
        if(places.isEmpty())body.addView(Ui.text(c,"No facilities found in the available map records; this does not establish that none exist.",14))
        places.forEach{p->body.addView(Ui.card(c,Ui.rowItem(c,p.name,hours(p),R.drawable.ic_location){place(c,p)}))}
        body.addView(Ui.text(c,"Map snapshot ${e.version?:"unavailable"} · collected ${e.collectedAt?.take(10)?:"unknown"}\n${e.limitations.orEmpty()}",12,tint=R.color.on_surface_secondary))
    }
}
