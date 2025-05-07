make delete-kind && \
make create-kind && \
helm install kyverno --namespace kyverno kyverno/kyverno --create-namespace --set enablePolicyException=true && \
kubectl apply -f clusterroles -R && \
kubectl apply -f policies.yaml