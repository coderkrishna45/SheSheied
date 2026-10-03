package com.sheshield.app.ui.components

import android.content.Context
import com.sheshield.app.R
import com.sheshield.app.data.model.ConditionPreview

object ConditionPreviewUi {
    fun color(p:ConditionPreview)=Ui.riskColor(p.level)
    fun detail(p:ConditionPreview):String {
        val s=p.summary ?: return "Street conditions are illustrative"
        return when {
            p.level=="UNKNOWN" -> "${p.coveragePercent}% sample coverage · remaining stretches unknown"
            s.cautionMeters>=30 -> "${s.cautionMeters} m with limited lighting & sparse foot traffic"
            s.mixedMeters>=30 -> "${s.mixedMeters} m with intermittent lighting & light foot traffic"
            else -> "Continuous lighting & regular foot traffic in this scenario"
        }
    }
    fun show(c:Context,p:ConditionPreview) {
        val body=Ui.col(c,20)
        body.addView(Ui.badge(c,"SALT LAKE · SYNTHETIC CONDITIONS"))
        body.addView(Ui.space(c,14));body.addView(Ui.text(c,p.label,20,true,color(p)))
        body.addView(Ui.text(c,detail(p),14))
        if(p.recommended)body.addView(Ui.text(c,"Preview choice · ${p.recommendationReason.orEmpty()}",14,true))
        body.addView(Ui.space(c,16))
        p.reasons.orEmpty().forEach { r ->
            body.addView(Ui.text(c,"${r.meters} m · ${r.conditions.joinToString(" · ")}",14,tint=Ui.riskColor(r.level)))
            body.addView(Ui.space(c,10))
        }
        body.addView(Ui.text(c,"${p.coveragePercent}% sample coverage. Unmatched streets remain unknown.",13,tint=R.color.on_surface_secondary))
        body.addView(Ui.space(c,16))
        body.addView(Ui.text(c,p.limitations ?: "These conditions are synthetic. Actual street safety remains unknown.",14))
        body.addView(Ui.text(c,"Scenario ${p.version.orEmpty()}. Road geometry comes from OpenStreetMap. Sample profiles illustrate lighting, activity and pedestrian space; they are not measurements. Turn this preview off in Settings before using evidence alone to plan a walk.",13,tint=R.color.on_surface_secondary))
        Ui.sheet(c,"Condition preview",body)
    }
}
