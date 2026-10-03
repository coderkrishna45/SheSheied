package com.sheshield.app.ui.components

import android.content.Context
import android.content.res.ColorStateList
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.graphics.drawable.RippleDrawable
import android.view.*
import android.widget.*
import androidx.core.content.ContextCompat
import androidx.core.view.ViewCompat
import com.google.android.material.bottomsheet.BottomSheetBehavior
import com.google.android.material.bottomsheet.BottomSheetDialog
import com.google.android.material.button.MaterialButton
import com.google.android.material.card.MaterialCardView
import com.google.android.material.dialog.MaterialAlertDialogBuilder
import com.google.android.material.materialswitch.MaterialSwitch
import com.google.android.material.textfield.TextInputEditText
import com.google.android.material.textfield.TextInputLayout
import com.sheshield.app.R

/** Shared visual language. All text uses sp; controls keep Android's 48 dp touch target. */
object Ui {
    fun dp(c:Context,n:Int)=(n*c.resources.displayMetrics.density).toInt()
    fun color(c:Context,id:Int)=ContextCompat.getColor(c,id)
    fun background(c:Context,tint:Int=R.color.surface,radius:Int=20)=GradientDrawable().apply{setColor(color(c,tint));cornerRadius=dp(c,radius).toFloat()}
    fun col(c:Context,padding:Int=0)=LinearLayout(c).apply{orientation=LinearLayout.VERTICAL;setPadding(dp(c,padding),dp(c,padding),dp(c,padding),dp(c,padding));layoutParams=ViewGroup.LayoutParams(-1,-2)}
    fun row(c:Context)=LinearLayout(c).apply{orientation=LinearLayout.HORIZONTAL;gravity=Gravity.CENTER_VERTICAL;layoutParams=ViewGroup.LayoutParams(-1,-2)}
    fun text(c:Context,value:String,size:Int=16,bold:Boolean=false,tint:Int=R.color.on_surface)=TextView(c).apply{
        text=value;textSize=size.toFloat();setTextColor(color(c,tint));typeface=Typeface.create(if(bold)"sans-serif-medium" else "sans-serif",Typeface.NORMAL)
        includeFontPadding=false;setLineSpacing(dp(c,if(size>=26)2 else 4).toFloat(),1f);letterSpacing=if(size>=24)-.025f else 0f
        layoutParams=LinearLayout.LayoutParams(-1,-2)
    }
    fun title(c:Context,value:String,size:Int=32)=text(c,value,size,true).apply{typeface=Typeface.create("sans-serif",Typeface.BOLD);ViewCompat.setAccessibilityHeading(this,true)}
    fun space(c:Context,size:Int)=View(c).apply{layoutParams=LinearLayout.LayoutParams(1,dp(c,size));importantForAccessibility=View.IMPORTANT_FOR_ACCESSIBILITY_NO}
    fun card(c:Context,body:View,selected:Boolean=false)=MaterialCardView(c).apply{
        radius=dp(c,20).toFloat();cardElevation=0f;setCardBackgroundColor(color(c,if(selected)R.color.selection else R.color.surface));strokeWidth=if(selected)dp(c,1) else 0;strokeColor=color(c,R.color.purple_primary)
        addView(body);layoutParams=LinearLayout.LayoutParams(-1,-2).apply{bottomMargin=dp(c,12)}
    }
    fun button(c:Context,label:String,secondary:Boolean=false,danger:Boolean=false,action:()->Unit)=MaterialButton(c).apply{
        text=label;isAllCaps=false;textSize=16f;typeface=Typeface.create("sans-serif-medium",Typeface.NORMAL);letterSpacing=0f;cornerRadius=dp(c,16);minHeight=dp(c,52);minimumHeight=dp(c,52);insetTop=0;insetBottom=0;elevation=0f;stateListAnimator=null
        val bg=if(danger)R.color.sos_red else if(secondary)R.color.surface_variant else R.color.purple_primary
        val fg=if(danger)R.color.white else if(secondary)R.color.purple_primary else R.color.surface
        backgroundTintList=ColorStateList(arrayOf(intArrayOf(-android.R.attr.state_enabled),intArrayOf()),intArrayOf(color(c,R.color.surface_variant),color(c,bg)))
        setTextColor(ColorStateList(arrayOf(intArrayOf(-android.R.attr.state_enabled),intArrayOf()),intArrayOf(color(c,R.color.on_surface_secondary),color(c,fg))))
        setPadding(dp(c,16),dp(c,12),dp(c,16),dp(c,12));layoutParams=LinearLayout.LayoutParams(-1,-2).apply{topMargin=dp(c,8)}
        setOnClickListener{action()}
    }
    fun sosButton(c:Context,action:()->Unit)=button(c,"Request SOS",danger=true,action=action).apply{contentDescription="Request SOS. Opens confirmation."}
    fun glyph(c:Context,drawable:Int,tint:Int=R.color.purple_primary,size:Int=24)=ImageView(c).apply{
        setImageResource(drawable);imageTintList=ColorStateList.valueOf(color(c,tint));layoutParams=LinearLayout.LayoutParams(dp(c,size),dp(c,size));importantForAccessibility=View.IMPORTANT_FOR_ACCESSIBILITY_NO
    }
    fun symbol(c:Context,drawable:Int,tint:Int=R.color.purple_primary,bg:Int=R.color.selection,size:Int=40)=FrameLayout(c).apply{
        background=background(c,bg,12);addView(glyph(c,drawable,tint),FrameLayout.LayoutParams(dp(c,22),dp(c,22),Gravity.CENTER));layoutParams=LinearLayout.LayoutParams(dp(c,size),dp(c,size));importantForAccessibility=View.IMPORTANT_FOR_ACCESSIBILITY_NO
    }
    fun icon(c:Context,drawable:Int,label:String,action:()->Unit)=ImageButton(c).apply{
        setImageResource(drawable);imageTintList=ColorStateList.valueOf(color(c,R.color.on_surface));contentDescription=label;background=RippleDrawable(ColorStateList.valueOf(color(c,R.color.selection)),background(c,R.color.surface,24),null)
        layoutParams=LinearLayout.LayoutParams(dp(c,48),dp(c,48));setPadding(dp(c,13),dp(c,13),dp(c,13),dp(c,13));setOnClickListener{action()}
    }
    fun header(c:Context,title:String,back:(()->Unit)?=null,settings:(()->Unit)?=null):LinearLayout= row(c).apply{
        if(back!=null)addView(icon(c,R.drawable.ic_back,"Back",back))
        addView((if(back==null)title(c,title,30)else text(c,title,18,true)).apply{layoutParams=LinearLayout.LayoutParams(0,-2,1f);if(back!=null)setPadding(dp(c,12),0,0,0)})
        if(settings!=null)addView(icon(c,R.drawable.ic_settings,"Settings",settings))
    }
    fun section(c:Context,label:String)=text(c,label.uppercase(java.util.Locale.getDefault()),12,true,R.color.on_surface_secondary).apply{letterSpacing=.075f;setPadding(dp(c,4),dp(c,18),0,dp(c,10));ViewCompat.setAccessibilityHeading(this,true)}
    fun divider(c:Context,inset:Int=16)=View(c).apply{setBackgroundColor(color(c,R.color.separator));layoutParams=LinearLayout.LayoutParams(-1,dp(c,1)).apply{marginStart=dp(c,inset);marginEnd=dp(c,inset)};importantForAccessibility=View.IMPORTANT_FOR_ACCESSIBILITY_NO}
    fun rowItem(c:Context,label:String,subtitle:String?=null,drawable:Int=0,tint:Int=R.color.purple_primary,action:(()->Unit)?=null):LinearLayout= row(c).apply{
        setPadding(dp(c,16),dp(c,14),dp(c,16),dp(c,14));minimumHeight=dp(c,64)
        if(drawable!=0){addView(symbol(c,drawable,tint,if(tint==R.color.risk_high)R.color.danger_surface else R.color.selection,36));addView(View(c).apply{layoutParams=LinearLayout.LayoutParams(dp(c,12),1)})}
        addView(col(c).apply{layoutParams=LinearLayout.LayoutParams(0,-2,1f);addView(text(c,label,16,true,if(tint==R.color.risk_high)tint else R.color.on_surface));if(!subtitle.isNullOrBlank()){addView(space(c,4));addView(text(c,subtitle,13,tint=R.color.on_surface_secondary))}})
        if(action!=null){addView(glyph(c,R.drawable.ic_chevron,R.color.on_surface_secondary,16).apply{layoutParams=LinearLayout.LayoutParams(dp(c,16),dp(c,20)).apply{marginStart=dp(c,8)}});background=RippleDrawable(ColorStateList.valueOf(color(c,R.color.selection)),null,background(c,R.color.surface,16));isFocusable=true;setOnClickListener{action()}}
    }
    fun toggle(c:Context,label:String,subtitle:String,checked:Boolean,onChange:(Boolean)->Unit):Pair<LinearLayout,MaterialSwitch>{
        val control=MaterialSwitch(c).apply{isChecked=checked;contentDescription=label;minHeight=dp(c,48);minimumWidth=dp(c,48)}
        val row=row(c).apply{setPadding(dp(c,16),dp(c,10),dp(c,12),dp(c,10));addView(col(c).apply{layoutParams=LinearLayout.LayoutParams(0,-2,1f);addView(text(c,label,16,true));addView(space(c,4));addView(text(c,subtitle,13,tint=R.color.on_surface_secondary))});addView(control)}
        control.setOnCheckedChangeListener{_,value->onChange(value)};return row to control
    }
    fun notice(c:Context,label:String,message:String,tone:Int=R.color.on_surface_secondary):View=row(c).apply{
        val bg=when(tone){R.color.risk_medium->R.color.warning_surface;R.color.risk_high->R.color.danger_surface;R.color.risk_low->R.color.teal_surface;else->R.color.surface_variant}
        background=background(c,bg,16);setPadding(dp(c,14),dp(c,14),dp(c,14),dp(c,14));gravity=Gravity.TOP
        addView(glyph(c,R.drawable.ic_info,tone,20));addView(col(c).apply{layoutParams=LinearLayout.LayoutParams(0,-2,1f).apply{marginStart=dp(c,10)};addView(text(c,label,14,true,tone));if(message.isNotBlank()){addView(space(c,4));addView(text(c,message,13,tint=R.color.on_surface_secondary))}})
    }
    fun input(c:Context,hint:String,value:String="",phone:Boolean=false):Pair<TextInputLayout,TextInputEditText>{
        val layout=TextInputLayout(c).apply{this.hint=hint;boxBackgroundMode=TextInputLayout.BOX_BACKGROUND_OUTLINE;boxBackgroundColor=color(c,R.color.surface);boxStrokeColor=color(c,R.color.purple_primary);setBoxCornerRadii(dp(c,14).toFloat(),dp(c,14).toFloat(),dp(c,14).toFloat(),dp(c,14).toFloat());layoutParams=LinearLayout.LayoutParams(-1,-2).apply{topMargin=dp(c,6);bottomMargin=dp(c,12)}}
        val edit=TextInputEditText(c).apply{setText(value);textSize=16f;setTextColor(color(c,R.color.on_surface));setSingleLine();minHeight=dp(c,56);if(phone)inputType=android.text.InputType.TYPE_CLASS_PHONE}
        layout.addView(edit);return layout to edit
    }
    fun scroll(c:Context,body:View)=ScrollView(c).apply{isFillViewport=false;clipToPadding=false;isVerticalScrollBarEnabled=false;overScrollMode=View.OVER_SCROLL_IF_CONTENT_SCROLLS;addView(body);layoutParams=ViewGroup.LayoutParams(-1,-1)}
    fun badge(c:Context,label:String,tint:Int=R.color.purple_primary)=text(c,label,12,true,tint).apply{
        setPadding(dp(c,10),dp(c,6),dp(c,10),dp(c,6));background=background(c,when(tint){R.color.risk_medium->R.color.warning_surface;R.color.risk_high->R.color.danger_surface;R.color.risk_low->R.color.teal_surface;else->R.color.selection},8);layoutParams=LinearLayout.LayoutParams(-2,-2)
    }
    fun dialog(c:Context)=MaterialAlertDialogBuilder(c,R.style.ThemeOverlay_Waymate_Dialog)
    fun error(c:Context,message:String){val title=when{message.contains("connection",true)||message.contains("internet",true)->"Connection unavailable";message.contains("GPS",true)||message.contains("location permission",true)->"Location unavailable";else->"Unable to continue"};dialog(c).setTitle(title).setMessage(message).setPositiveButton("OK",null).show()}
    fun info(c:Context,title:String,message:String){dialog(c).setTitle(title).setMessage(message).setPositiveButton("Done",null).show()}
    fun confirm(c:Context,title:String,message:String,positive:String="Continue",action:()->Unit){
        val alert=dialog(c).setTitle(title).setMessage(message).setNegativeButton("Cancel",null).setPositiveButton(positive){_,_->action()}.show()
        if(positive in listOf("Request SOS","Remove","Delete","Cancel alert"))alert.getButton(-1).setTextColor(color(c,R.color.risk_high))
    }
    fun sheet(c:Context,title:String,body:View):BottomSheetDialog{
        val dialog=BottomSheetDialog(c);val root=col(c);root.setPadding(0,dp(c,10),0,dp(c,12));val handle=View(c).apply{background=background(c,R.color.separator,4)}
        root.addView(handle,LinearLayout.LayoutParams(dp(c,32),dp(c,4)).apply{gravity=Gravity.CENTER_HORIZONTAL;bottomMargin=dp(c,16)})
        root.addView(row(c).apply{setPadding(dp(c,22),0,dp(c,12),dp(c,12));addView(text(c,title,21,true).apply{layoutParams=LinearLayout.LayoutParams(0,-2,1f)});addView(icon(c,R.drawable.ic_close,"Close sheet"){dialog.dismiss()})})
        root.addView(scroll(c,body),LinearLayout.LayoutParams(-1,0,1f));dialog.setContentView(root)
        root.layoutParams=root.layoutParams.apply{height=(c.resources.displayMetrics.heightPixels*.85f).toInt()}
        dialog.behavior.state=BottomSheetBehavior.STATE_EXPANDED;dialog.behavior.skipCollapsed=true;dialog.show();return dialog
    }
    fun riskColor(level:String)=when(level){"LOW"->R.color.risk_low;"MEDIUM"->R.color.risk_medium;"HIGH"->R.color.risk_high;else->R.color.risk_unknown}
}
