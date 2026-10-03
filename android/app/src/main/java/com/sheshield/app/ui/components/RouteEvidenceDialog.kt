package com.sheshield.app.ui.components

import android.content.Context
import android.content.Intent
import android.net.Uri
import com.sheshield.app.R
import com.sheshield.app.data.model.*

object RouteEvidenceDialog {
    fun show(c:Context,route:RouteOption){
        val body=Ui.col(c,22)
        if(route.isDemoData)body.addView(Ui.badge(c,"FICTIONAL EVIDENCE · RECORDED DEMO"))
        route.preview?.let{p->
            body.addView(Ui.badge(c,"SYNTHETIC CONDITIONS · LIVE ROUTE"))
            body.addView(Ui.card(c,Ui.rowItem(c,p.label,ConditionPreviewUi.detail(p),R.drawable.ic_walk){ConditionPreviewUi.show(c,p)}))
            if(p.recommended)body.addView(Ui.text(c,p.recommendationReason.orEmpty(),13,tint=R.color.on_surface_secondary))
        }
        val reports=route.evidence.orEmpty().filter{!it.historical}
        val area=route.insightContext ?: route.contextEvidence.orEmpty().filter{!it.historical&&it.setting=="public_space"&&it.category!="traffic_incident"}.take(5)
        body.addView(Ui.text(c,if(route.isDemoData)route.riskSummary else "Safety remains unknown",17,true))
        body.addView(Ui.text(c,if(route.isDemoData)"${reports.size} fictional reports for this practice walk." else if(reports.isEmpty())"No reviewed street reports matched this route." else "${reports.size} reviewed street reports matched this route.",14))
        route.decision?.reasons.orEmpty().filter{it.kind=="TIME"}.take(1).forEach{body.addView(Ui.text(c,it.text,14))}
        route.environment?.let{e->body.addView(Ui.card(c,Ui.rowItem(c,"Walking conditions","Lighting, walkways & nearby places",R.drawable.ic_walk){WalkingDetails.show(c,e)}))}
        if(reports.isNotEmpty()){
            body.addView(Ui.section(c,if(route.isDemoData)"Practice reports" else "Along this route"))
            reports.take(3).forEach{reportRow(c,body,it,false)}
            if(reports.size>3)body.addView(Ui.button(c,"More street reports",true){reportList(c,"Street reports",reports.drop(3),false)})
        }
        if(area.isNotEmpty()){
            body.addView(Ui.section(c,if(route.contextSelection?.basis=="EXPANDED_AREA")"Wider-area references" else "Area references"))
            body.addView(Ui.text(c,route.contextSelection?.notice?:"Exact incident streets remain unconfirmed.",13,tint=R.color.on_surface_secondary))
            area.take(3).forEach{reportRow(c,body,it,true)}
            if(area.size>3)body.addView(Ui.button(c,"More area references",true){reportList(c,"Area references",area.drop(3),true)})
        }else body.addView(Ui.text(c,route.contextSelection?.notice?:"No relevant recent area reports are available.",13,tint=R.color.on_surface_secondary))
        body.addView(Ui.card(c,Ui.rowItem(c,"About the data","Sources, dates & reporting limits",R.drawable.ic_info){about(c,route)}))
        body.addView(Ui.text(c,"Missing reports never establish safety.",13,tint=R.color.on_surface_secondary))
        Ui.sheet(c,"Route insights",body)
    }
    private fun reportRow(c:Context,body:android.widget.LinearLayout,e:Evidence,area:Boolean){
        val category=e.category.replace('_',' ').replaceFirstChar{it.uppercase()}
        val date=e.occurred?.label?.takeIf{it.isNotBlank()}?:e.occurred?.start?.take(10)?:"${e.daysOld} days ago"
        body.addView(Ui.card(c,Ui.rowItem(c,category,"${e.locationLabel?:e.source} · $date",R.drawable.ic_info){
            val details=Ui.col(c,20);report(c,details,e,area);Ui.sheet(c,"Report details",details)
        }))
    }
    private fun reportList(c:Context,title:String,reports:List<Evidence>,area:Boolean){
        val body=Ui.col(c,20);reports.forEach{reportRow(c,body,it,area)};Ui.sheet(c,title,body)
    }
    private fun about(c:Context,route:RouteOption){
        val body=Ui.col(c,20)
        if(route.isDemoData)body.addView(Ui.badge(c,"FICTIONAL EVIDENCE · RECORDED DEMO"))
        route.passport?.let{p->
            body.addView(Ui.text(c,"${p.coveragePercent}% ${if(route.isDemoData)"fictional" else "complete"} reporting coverage",16,true))
            body.addView(Ui.text(c,p.limitations?:"Reporting is incomplete. Source review does not establish occurrence or safety.",14))
            p.datasetCollection?.let{body.addView(Ui.text(c,it,14))}
            body.addView(Ui.text(c,"Dataset ${p.datasetVersion?:"unavailable"} · updated ${p.datasetUpdatedAt?.take(10)?:"unknown"}",13,tint=R.color.on_surface_secondary))
        }
        if(route.evaluatedAt.isNotBlank())body.addView(Ui.text(c,"Evaluated ${route.evaluatedAt.take(16).replace('T',' ')} UTC",13))
        val history=route.contextEvidence.orEmpty().filter{it.historical}
        if(history.isNotEmpty())body.addView(Ui.button(c,"Historical area references (${history.size})",true){reportList(c,"Historical references",history.take(10),true)})
        val observations=route.observations.orEmpty()
        if(observations.isEmpty())body.addView(Ui.text(c,"No current independently reviewed street observations were matched.",14))
        else observations.forEach{o->body.addView(Ui.text(c,"${o.kind.replace('_',' ')} · ${o.locationLabel?:"reviewed section"}\nObserved ${o.observedAt.take(10)} · expires ${o.expiresAt} · ${o.timeOfDay}",14));link(c,body,o.sourceUrl,"Open observation")}
        body.addView(Ui.text(c,"Area search bounds locate research, not an incident. News reports are allegations, and no complete Kolkata incident feed is available in this dataset.",14))
        Ui.sheet(c,"About the data",body)
    }
    private fun report(c:Context,container:android.widget.LinearLayout,e:Evidence,context:Boolean){
        val body=Ui.col(c,16)
        val category=e.category.replace('_',' ').replaceFirstChar{it.uppercase()}
        body.addView(Ui.text(c,(if(e.historical)"Historical · " else "")+category,16,true))
        val date=e.occurred?.label?.takeIf{it.isNotBlank()}?:e.occurred?.start?.take(10)?:"${e.daysOld} days ago"
        body.addView(Ui.text(c,"$date\n${e.locationLabel?:e.source}",14))
        e.summary?.let{body.addView(Ui.text(c,it,14))}
        e.reportStatus?.let{body.addView(Ui.text(c,it.replace('_',' ')+" · source checked ${e.reviewedAt?.take(10)?:"unknown"}",13,tint=R.color.on_surface_secondary))}
        if(e.relation=="MATCHED_STREET")body.addView(Ui.text(c,"Location reviews recorded: ${e.reviewCount} · matched by street name and reviewed geometry",13))
        if(context){e.exclusionReason?.let{body.addView(Ui.text(c,it,14,tint=R.color.risk_medium))};e.locationReason?.let{body.addView(Ui.text(c,it,13,tint=R.color.on_surface_secondary))}}
        else if(e.relation==null)body.addView(Ui.text(c,"Estimated ${e.distanceMinMeters}–${e.distanceMaxMeters} m from route · location uncertainty ±${e.precisionMeters} m\nNearby geography can include another street.",13))
        val references=e.references.orEmpty()
        if(references.isEmpty())e.sourceUrl?.let{link(c,body,it,"Open source report")}
        else references.forEach{link(c,body,it.url,"Open ${it.source}")}
        container.addView(Ui.card(c,body))
    }
    private fun link(c:Context,body:android.widget.LinearLayout,url:String,label:String){
        val uri=Uri.parse(url);if(uri.scheme!="https"||uri.host.isNullOrBlank())return
        body.addView(Ui.button(c,label,true){runCatching{c.startActivity(Intent(Intent.ACTION_VIEW,uri))}.onFailure{Ui.error(c,"A browser could not open this source.")}})
    }
}
