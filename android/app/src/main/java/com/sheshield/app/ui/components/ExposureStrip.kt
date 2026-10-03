package com.sheshield.app.ui.components

import android.content.Context
import android.graphics.Canvas
import android.graphics.Paint
import android.view.View
import com.sheshield.app.R
import com.sheshield.app.data.model.RouteOption

class ExposureStrip(context:Context):View(context){
    var route:RouteOption?=null
        set(value){field=value;invalidate()}
    var progress=0f
        set(value){field=value;invalidate()}
    private val paint=Paint(Paint.ANTI_ALIAS_FLAG)
    init{contentDescription="Reported exposure along the journey; grey marks missing coverage; amber marks nearby reports";minimumHeight=Ui.dp(context,24)}
    override fun onDraw(canvas:Canvas){super.onDraw(canvas)
        val preview=route?.preview?.stretches.orEmpty()
        if(preview.isNotEmpty()){
            contentDescription="Synthetic walking conditions along the live route; green supportive, amber mixed, red exposed, grey unknown"
            val total=preview.sumOf{it.distanceMeters}.coerceAtLeast(1);var left=0f
            preview.forEach{s->val right=left+(s.distanceMeters.toDouble()/total*width).toFloat();paint.color=Ui.color(context,Ui.riskColor(s.level));canvas.drawRoundRect(left,8f,right.coerceAtLeast(left+2),height-8f,6f,6f,paint);left=right}
            paint.color=Ui.color(context,R.color.on_surface);canvas.drawCircle(width*progress.coerceIn(0f,1f),height/2f,Ui.dp(context,5).toFloat(),paint);return
        }
        contentDescription="Reported exposure along the journey; grey marks missing coverage; amber marks nearby reports"
        val segments=route?.segments.orEmpty();if(segments.isEmpty())return
        val total=segments.sumOf{it.distanceMeters}.coerceAtLeast(1.0);var left=0f
        segments.forEach{s->val right=left+(s.distanceMeters/total*width).toFloat();paint.color=Ui.color(context,if(route?.isDemoData!=true){if(s.evidenceCount>0)R.color.risk_medium else R.color.risk_unknown}else if(s.evidenceCount>0&&s.level=="UNKNOWN")R.color.risk_medium else Ui.riskColor(s.level));canvas.drawRoundRect(left,8f,right.coerceAtLeast(left+2),height-8f,6f,6f,paint);left=right}
        paint.color=Ui.color(context,R.color.on_surface);canvas.drawCircle(width*progress.coerceIn(0f,1f),height/2f,Ui.dp(context,5).toFloat(),paint)
    }
}
