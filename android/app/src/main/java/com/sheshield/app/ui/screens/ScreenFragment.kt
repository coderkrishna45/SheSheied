package com.sheshield.app.ui.screens

import android.content.Intent
import android.view.*
import android.widget.LinearLayout
import androidx.fragment.app.Fragment
import androidx.lifecycle.lifecycleScope
import com.sheshield.app.R
import com.sheshield.app.ui.MainActivity
import com.sheshield.app.ui.components.Ui
import com.sheshield.app.data.network.NetworkClient
import kotlinx.coroutines.launch

abstract class ScreenFragment:Fragment(){
    val main get()=requireActivity() as MainActivity
    val repo get()=main.tripViewModel.repo
    fun page(title:String,back:Boolean=true):LinearLayout=Ui.col(requireContext(),22).apply{addView(Ui.header(context,title,if(back)({main.nav.popBackStack();Unit})else null));addView(Ui.space(context,24))}
    fun runAction(block:suspend ()->Unit){viewLifecycleOwner.lifecycleScope.launch{try{block()}catch(e:kotlinx.coroutines.CancellationException){throw e}catch(e:Exception){if(isAdded)Ui.error(requireContext(),NetworkClient.message(e))}}}
    fun share(text:String){startActivity(Intent.createChooser(Intent(Intent.ACTION_SEND).setType("text/plain").putExtra(Intent.EXTRA_TEXT,text),"Share journey"))}
    fun sos(){Ui.confirm(requireContext(),"Request help?",if(repo.demo())"This rehearsal sends no real messages or calls." else "This requests alerts to your trusted contacts using configured channels.","Request SOS"){
        runAction{val host=main;val repository=repo;val fix=if(!repository.demo()&&com.sheshield.app.util.LocationProvider(host).permitted())kotlinx.coroutines.withTimeoutOrNull(2000){runCatching{com.sheshield.app.util.LocationProvider(host).current()}.getOrNull()}else null
            val incident=repository.createSos("MANUAL",fix);com.sheshield.app.util.NotificationHelper.showSos(host,incident)
            view?.performHapticFeedback(HapticFeedbackConstants.LONG_PRESS);host.navigate(R.id.sosFragment)}
    }}
}
