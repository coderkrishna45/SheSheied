package com.sheshield.app.ui.components

import android.content.Context
import android.graphics.*
import android.view.View
import com.sheshield.app.R

/** Decorative route illustration; never represents a real route or local conditions. */
class JourneyArtwork(context:Context):View(context){
    private val paint=Paint(Paint.ANTI_ALIAS_FLAG)
    init{importantForAccessibility=IMPORTANT_FOR_ACCESSIBILITY_NO}
    override fun onDraw(canvas:Canvas){
        super.onDraw(canvas);canvas.save();canvas.scale(width/360f,height/132f)
        paint.style=Paint.Style.FILL;paint.color=Ui.color(context,R.color.hero_surface);canvas.drawRoundRect(0f,0f,360f,132f,18f,18f,paint)
        paint.color=Ui.color(context,R.color.teal_surface);canvas.drawRoundRect(230f,10f,347f,75f,20f,20f,paint);canvas.drawRoundRect(13f,86f,95f,121f,15f,15f,paint)
        paint.style=Paint.Style.STROKE;paint.strokeCap=Paint.Cap.ROUND;paint.color=Ui.color(context,R.color.surface);paint.strokeWidth=14f
        for(y in listOf(35f,87f))canvas.drawLine(-10f,y,370f,y-13,paint)
        for(x in listOf(50f,143f,222f,306f))canvas.drawLine(x,-10f,x-14,145f,paint)
        val route=Path().apply{moveTo(61f,105f);lineTo(120f,105f);quadTo(134f,105f,134f,91f);lineTo(134f,65f);quadTo(134f,53f,148f,53f);lineTo(262f,53f);quadTo(274f,53f,274f,39f);lineTo(274f,27f)}
        paint.strokeWidth=9f;paint.color=Ui.color(context,R.color.surface);canvas.drawPath(route,paint)
        paint.strokeWidth=3.5f;paint.color=Ui.color(context,R.color.purple_primary);canvas.drawPath(route,paint)
        paint.style=Paint.Style.FILL;paint.color=Ui.color(context,R.color.surface);canvas.drawCircle(61f,105f,8f,paint);canvas.drawCircle(274f,27f,10f,paint)
        paint.color=Ui.color(context,R.color.purple_primary);canvas.drawCircle(61f,105f,4f,paint);canvas.drawCircle(274f,27f,6f,paint)
        canvas.restore()
    }
}
