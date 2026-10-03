package com.sheshield.app.service

import android.content.Context
import androidx.work.*
import com.sheshield.app.data.repository.TripRepository
import java.util.concurrent.TimeUnit

class SyncWorker(context:Context,params:WorkerParameters):CoroutineWorker(context,params){
    override suspend fun doWork():Result {
        val repo=TripRepository.get(applicationContext)
        repo.sync()
        return if(repo.dao.queued().isEmpty())Result.success() else Result.retry()
    }
    companion object {
        fun schedule(context:Context){
            val request=OneTimeWorkRequestBuilder<SyncWorker>()
                .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
                .setBackoffCriteria(BackoffPolicy.EXPONENTIAL,30,TimeUnit.SECONDS).build()
            WorkManager.getInstance(context).enqueueUniqueWork("journey-outbox",ExistingWorkPolicy.APPEND_OR_REPLACE,request)
        }
    }
}
