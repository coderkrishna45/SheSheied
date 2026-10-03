package com.sheshield.app.ui

import android.Manifest
import android.content.Intent
import android.os.Bundle
import android.view.View
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.appcompat.app.AppCompatDelegate
import androidx.core.view.*
import androidx.lifecycle.ViewModelProvider
import androidx.navigation.NavOptions
import androidx.navigation.fragment.NavHostFragment
import com.sheshield.app.R
import com.sheshield.app.databinding.ActivityMainBinding
import com.sheshield.app.ui.viewmodel.*

class MainActivity:AppCompatActivity(){
    lateinit var tripViewModel:TripViewModel
    lateinit var planningViewModel:PlanningViewModel
    private lateinit var binding:ActivityMainBinding
    val nav get()=(supportFragmentManager.findFragmentById(R.id.nav_host_fragment) as NavHostFragment).navController
    private var permissionCallback:((Boolean)->Unit)?=null
    private val locationPermission=registerForActivityResult(ActivityResultContracts.RequestMultiplePermissions()){grants->permissionCallback?.invoke(grants[Manifest.permission.ACCESS_FINE_LOCATION]==true||grants[Manifest.permission.ACCESS_COARSE_LOCATION]==true);permissionCallback=null}
    private val notifications=registerForActivityResult(ActivityResultContracts.RequestPermission()){}
    override fun onCreate(state:Bundle?){
        val mode=getSharedPreferences("sheshield_prefs",MODE_PRIVATE).getInt("appearance",AppCompatDelegate.MODE_NIGHT_FOLLOW_SYSTEM)
        AppCompatDelegate.setDefaultNightMode(mode)
        super.onCreate(state);binding=ActivityMainBinding.inflate(layoutInflater);setContentView(binding.root)
        WindowCompat.setDecorFitsSystemWindows(window,false)
        val light=resources.configuration.uiMode and android.content.res.Configuration.UI_MODE_NIGHT_MASK != android.content.res.Configuration.UI_MODE_NIGHT_YES
        WindowCompat.getInsetsController(window,binding.root).apply{isAppearanceLightStatusBars=light;isAppearanceLightNavigationBars=light}
        ViewCompat.setOnApplyWindowInsetsListener(binding.root){v,insets->val bars=insets.getInsets(WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.ime());v.setPadding(bars.left,bars.top,bars.right,bars.bottom);insets}
        tripViewModel=ViewModelProvider(this)[TripViewModel::class.java];planningViewModel=ViewModelProvider(this)[PlanningViewModel::class.java]
        binding.bottomNavigation.setOnItemSelectedListener{item->if(nav.currentDestination?.id!=item.itemId)nav.navigate(item.itemId,null,NavOptions.Builder().setPopUpTo(R.id.homeFragment,false).setLaunchSingleTop(true).build());true}
        nav.addOnDestinationChangedListener{_,destination,_->val tab=destination.id in listOf(R.id.homeFragment,R.id.contactsFragment,R.id.historyFragment);binding.bottomNavigation.visibility=if(tab)View.VISIBLE else View.GONE;if(tab)binding.bottomNavigation.menu.findItem(destination.id)?.isChecked=true}
        if(state==null)binding.root.post{handleIntent(intent)}
    }
    fun navigate(destination:Int){if(nav.currentDestination?.id!=destination)nav.navigate(destination)}
    fun requestLocation(callback:(Boolean)->Unit){permissionCallback=callback;locationPermission.launch(arrayOf(Manifest.permission.ACCESS_FINE_LOCATION,Manifest.permission.ACCESS_COARSE_LOCATION))}
    fun requestNotifications(){if(android.os.Build.VERSION.SDK_INT>=33)notifications.launch(Manifest.permission.POST_NOTIFICATIONS)}
    override fun onNewIntent(intent:Intent){super.onNewIntent(intent);setIntent(intent);handleIntent(intent)}
    private fun handleIntent(intent:Intent){when(intent.getStringExtra("screen")){"trip"->navigate(R.id.activeTripFragment);"sos"->navigate(R.id.sosFragment)}}
}
