package com.sheshield.app

import android.content.res.Configuration
import android.view.ContextThemeWrapper
import androidx.test.core.app.ActivityScenario
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.sheshield.app.ui.MainActivity
import com.sheshield.app.ui.components.Ui
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith

/** Inflate the real theme: missing layout attributes cannot be caught by JVM tests. No journeys or alerts. */
@RunWith(AndroidJUnit4::class)
class DesignPresentationTest {
    @Test fun dialogsAndSheetsRenderInBothAppearances(){
        ActivityScenario.launch(MainActivity::class.java).use{scenario->scenario.onActivity{activity->
            for(night in listOf(Configuration.UI_MODE_NIGHT_NO,Configuration.UI_MODE_NIGHT_YES)){
                val context=ContextThemeWrapper(activity,R.style.Theme_Waymate)
                context.applyOverrideConfiguration(Configuration(activity.resources.configuration).apply{uiMode=(uiMode and Configuration.UI_MODE_NIGHT_MASK.inv()) or night})
                val message=Ui.dialog(context).setTitle("Connection unavailable").setMessage("Check your connection and try again.").setPositiveButton("OK",null).show()
                assertTrue(message.isShowing);assertNotNull(message.getButton(-1));message.dismiss()
                val choice=Ui.dialog(context).setTitle("Time to respond").setSingleChoiceItems(arrayOf("2 minutes","5 minutes"),0){_,_->}.setNegativeButton("Cancel",null).show()
                assertEquals(2,choice.listView.adapter.count);choice.dismiss()
                val input=Ui.input(context,"Name");val custom=Ui.dialog(context).setTitle("Add a contact").setView(input.first).setPositiveButton("Save",null).show()
                assertTrue(custom.isShowing);assertNotNull(input.first.parent);custom.dismiss()
                val sheet=Ui.sheet(context,"Route insights",Ui.col(context,20).apply{addView(Ui.text(context,"Safety information is incomplete."))})
                assertTrue(sheet.isShowing);sheet.dismiss()
            }
        }}
    }
}
