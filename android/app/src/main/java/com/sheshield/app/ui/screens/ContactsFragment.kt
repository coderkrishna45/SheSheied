package com.sheshield.app.ui.screens

import android.os.Bundle
import android.view.*
import android.widget.*
import com.sheshield.app.R
import com.sheshield.app.data.model.TrustedContact
import com.sheshield.app.ui.components.Ui

class ContactsFragment:ScreenFragment(){
    private lateinit var list:LinearLayout
    override fun onCreateView(inflater:LayoutInflater,container:ViewGroup?,state:Bundle?):View{
        val c=requireContext();val body=page("Your circle",false)
        body.addView(Ui.text(c,"The people you want beside you.",17,tint=R.color.on_surface_secondary));body.addView(Ui.space(c,24))
        body.addView(Ui.notice(c,"Called in order","If a contact does not acknowledge, the next person is tried. SMS and call status remain separate."));body.addView(Ui.section(c,"Trusted contacts"))
        list=Ui.col(c);body.addView(list);body.addView(Ui.button(c,"Add a trusted contact"){edit(null)});body.addView(Ui.space(c,16))
        body.addView(Ui.button(c,"Check cloud calls & SMS",true){runAction{
            val check=repo.deliveryCheck();val content=Ui.col(c,20)
            check.contacts.forEach{entry->content.addView(Ui.card(c,Ui.col(c,16).apply{
                addView(Ui.text(c,entry.contact.name,18,true))
                addView(Ui.text(c,"Calls: ${if(entry.voiceConfigured)"configured" else "unavailable"}\nSMS: ${if(entry.smsConfigured)"configured" else "unavailable"}",15))
                listOfNotNull(entry.voiceReason,entry.smsReason).distinct().forEach{addView(Ui.text(c,it,14,tint=R.color.risk_medium))}
            }))};content.addView(Ui.text(c,check.notice,13,tint=R.color.on_surface_secondary));Ui.sheet(c,"Cloud delivery",content)
        }})
        body.addView(Ui.text(c,"Changes update an active journey after syncing. An SOS already in progress keeps its recipients. Trial recipients must be verified in Twilio.",13,tint=R.color.on_surface_secondary));render();return Ui.scroll(c,body)
    }
    private fun render(){val c=requireContext();list.removeAllViews();val contacts=repo.contacts()
        if(contacts.isEmpty())list.addView(Ui.card(c,Ui.col(c,24).apply{addView(Ui.symbol(c,R.drawable.ic_contacts));addView(Ui.space(c,18));addView(Ui.text(c,"Make room for your people",20,true));addView(Ui.space(c,8));addView(Ui.text(c,"Add someone who knows you and can respond when you need help.",15,tint=R.color.on_surface_secondary))}))
        else {val group=Ui.col(c)
            contacts.forEachIndexed{index,contact->
                if(index>0)group.addView(Ui.divider(c,64))
                group.addView(Ui.rowItem(c,contact.name,"${if(index==0)"First contact" else "Contact ${index+1}"} · •••• ${contact.phone.takeLast(4)}",R.drawable.ic_contacts){
                    Ui.dialog(c).setTitle(contact.name).setItems(arrayOf("Edit contact","Make first contact","Remove contact")){_,choice->when(choice){
                        0->edit(index)
                        1->runAction{val updated=repo.contacts().toMutableList();updated.removeAt(index);updated.add(0,contact);repo.saveContacts(updated);render()}
                        2->Ui.confirm(c,"Remove ${contact.name}?","They will no longer receive future alerts after your Circle syncs. An SOS already in progress keeps its recipients.","Remove"){runAction{repo.saveContacts(repo.contacts().filterIndexed{i,_->i!=index});render()}}
                    }}.setNegativeButton("Cancel",null).show()
                })
            };list.addView(Ui.card(c,group))
        }
    }
    private fun edit(index:Int?){val c=requireContext();val old=index?.let{repo.contacts().getOrNull(it)};val form=Ui.col(c,20);val name=Ui.input(c,"Name",old?.name?:"");val phone=Ui.input(c,"Phone number",old?.phone?:"",true);form.addView(name.first);form.addView(phone.first)
        val dialog=Ui.dialog(c).setTitle(if(old==null)"Add to your circle" else "Edit contact").setView(form).setNegativeButton("Cancel",null).setPositiveButton("Save",null).create()
        dialog.setOnShowListener{dialog.getButton(-1).setOnClickListener{
            val label=name.second.text.toString().trim();var number=phone.second.text.toString().replace(Regex("[\\s()-]"),"");if(number.matches(Regex("[6-9][0-9]{9}")))number="+91$number"
            if(label.isEmpty()){name.first.error="Enter a name";return@setOnClickListener}
            if(!number.matches(Regex("\\+[1-9][0-9]{7,14}"))){phone.first.error="Use an international number, for example +91…";return@setOnClickListener}
            val updated=repo.contacts().toMutableList();if(updated.withIndex().any{it.index!=index&&it.value.phone==number}){phone.first.error="This number is already in your circle";return@setOnClickListener}
            if(index==null&&updated.size>=10){phone.first.error="Your circle can contain up to ten contacts";return@setOnClickListener}
            val item=TrustedContact(label,number);if(index!=null)updated[index]=item else updated.add(item);runAction{repo.saveContacts(updated);render();dialog.dismiss()}
        }};dialog.show()
    }
}
